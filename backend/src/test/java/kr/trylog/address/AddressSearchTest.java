package kr.trylog.address;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.GZIPOutputStream;
import kr.trylog.shared.InvalidInputException;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.server.ResponseStatusException;

class AddressSearchTest {
    private final JusoAddressClient national = mock(JusoAddressClient.class);

    @Test
    void packagedDirectoryFindsBothCitiesUnderTheAdministrativeDongAndPaginatesThem() throws Exception {
        var directory = new LocalAddressDirectory(new ClassPathResource("address/local-addresses.tsv.gz"));
        var controller = new AddressSearchController(directory, national);
        when(national.enabled()).thenReturn(true);

        var first = controller.search("  여의동 ", "1", "auto");
        var second = controller.search("여의동", "2", first.coverage());
        assertThat(first.coverage()).isEqualTo("local");
        assertThat(first.hasMore()).isTrue();
        assertThat(first.suggestions()).hasSize(10).extracting(AddressSuggestion::ctyCd).contains("11560", "52113");
        assertThat(second.suggestions()).hasSize(10).doesNotContainAnyElementsOf(first.suggestions());
        assertThat(first.suggestions()).allSatisfy(address -> {
            assertThat(address.postalCode()).matches("[0-9]{5}");
            assertThat(address.address()).isEqualTo(address.roadAddress());
            assertThat(address.megaCd()).isEqualTo(address.ctyCd().substring(0, 2));
        });
        verify(national, never()).search(anyString(), anyInt(), anyInt());
    }

    @Test
    void exactStreetNumberIsSeparateFromLotNumbersAndMetadata() throws Exception {
        var controller = new AddressSearchController(fixtureDirectory(), national);
        var result = controller.search("서울시  영등포구  63로 10", "1", "auto");
        assertThat(result.suggestions()).singleElement().satisfies(address -> {
            assertThat(address.roadAddress()).endsWith("63로 10");
            assertThat(address.postalCode()).isEqualTo("07345");
        });
        assertThat(result.hasMore()).isFalse();
        assertThat(controller.search("63로 63", "1", "local").suggestions()).isEmpty();
        assertThat(controller.search("여의도동 62", "1", "local").suggestions()).hasSize(1);
        assertThat(controller.search("07345", "1", "local").suggestions()).isEmpty();
        assertThat(controller.search("서울시", "999999999", "local").suggestions()).isEmpty();
        assertThatThrownBy(() -> controller.search("여의동", "0", "local")).isInstanceOf(InvalidInputException.class);
    }

    @Test
    void duplicateRoadAliasesRemainSearchableAndAreNotRepeatedAcrossPages() throws Exception {
        var directory = fixtureDirectory();
        var first = directory.search("서울시", 1, 1);
        var second = directory.search("서울시", 2, 1);
        assertThat(first.suggestions()).singleElement().extracting(AddressSuggestion::address).asString().endsWith("63로 10");
        assertThat(second.suggestions()).singleElement().extracting(AddressSuggestion::address).asString().endsWith("63로 110");
        assertThat(second.hasMore()).isFalse();
        assertThat(directory.search("여의도동 61", 1, 10).suggestions()).singleElement()
                .extracting(AddressSuggestion::jibunAddress).asString().endsWith("여의도동 61");
    }

    @Test
    void providerRemainsFixedAfterFallbackOrOnSubsequentNationalPages() throws Exception {
        var controller = new AddressSearchController(fixtureDirectory(), national);
        when(national.enabled()).thenReturn(true);
        when(national.search(anyString(), anyInt(), anyInt())).thenThrow(JusoAddressClient.unavailable());
        var fallback = controller.search("영등포구", "1", "auto");
        assertThat(fallback.coverage()).isEqualTo("local");
        assertThat(controller.search("영등포구", "2", fallback.coverage()).suggestions()).isEmpty();
        verify(national, never()).search("영등포구", 2, 10);
        assertThatThrownBy(() -> controller.search("영등포구", "2", "national")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.search("부산시", "1", "auto")).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void nationalResponseUsesTheLegalDistrictCodeAndKeepsLeadingZeroPostcodes() throws Exception {
        var json = new ObjectMapper();
        var body = json.readTree("""
                {"results":{"common":{"errorCode":"0","totalCount":"11"},"juso":[
                {"roadAddrPart1":"서울특별시 영등포구 63로 10","jibunAddr":"서울특별시 영등포구 여의도동 62",
                 "zipNo":"07345","siNm":"서울특별시","sggNm":"영등포구","admCd":"1156011000"},
                {"roadAddr":"세종특별자치시 한누리대로 2130","zipNo":"30151","siNm":"세종특별자치시","sggNm":"","admCd":"3611010300"},
                {"zipNo":"07345","siNm":"서울특별시","sggNm":"영등포구","admCd":"11560xxxxx"}]}}
                """);
        var first = JusoAddressClient.read(body, 1, 10);
        assertThat(first.suggestions()).hasSize(2);
        assertThat(first.suggestions().get(0).postalCode()).isEqualTo("07345");
        assertThat(first.suggestions().get(0).ctyCd()).isEqualTo("11560");
        assertThat(first.suggestions().get(1).ctyNm()).isEqualTo("세종특별자치시");
        assertThat(first.hasMore()).isTrue();
        assertThat(JusoAddressClient.read(body, 2, 10).hasMore()).isFalse();
        var denied = json.readTree("{\"results\":{\"common\":{\"errorCode\":\"E0001\"},\"juso\":null}}");
        assertThatThrownBy(() -> JusoAddressClient.read(denied, 1, 10)).isInstanceOf(ResponseStatusException.class);
    }

    private LocalAddressDirectory fixtureDirectory() throws Exception {
        var rows = List.of("roadAddress\tjibunAddress\tpostalCode\tmegaNm\tctyNm\tctyCd\tsearchAliases",
                "서울특별시 영등포구 63로 10\t서울특별시 영등포구 여의도동 61\t07345\t서울특별시\t영등포구\t11560\t여의동 여의도동",
                "서울특별시 영등포구 63로 10\t서울특별시 영등포구 여의도동 62\t07345\t서울특별시\t영등포구\t11560\t여의동 여의도동",
                "서울특별시 영등포구 63로 110\t서울특별시 영등포구 여의도동 10\t07344\t서울특별시\t영등포구\t11560\t여의동 여의도동");
        var data = new ByteArrayOutputStream();
        try (var compressed = new GZIPOutputStream(data)) {
            compressed.write(String.join("\n", rows).getBytes(StandardCharsets.UTF_8));
        }
        return new LocalAddressDirectory(new ByteArrayResource(data.toByteArray()));
    }
}
