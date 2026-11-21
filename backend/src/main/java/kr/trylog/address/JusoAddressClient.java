package kr.trylog.address;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Component
class JusoAddressClient {
    private static final String ENDPOINT = "https://business.juso.go.kr/addrlink/addrLinkApi.do";
    private static final Pattern DONG_CODE = Pattern.compile("[0-9]{10}");
    private final String key;
    private final ObjectMapper json;
    private final RestClient client;

    JusoAddressClient(@Value("${trylog.address-api-key:}") String key, ObjectMapper json) {
        this.key = key.strip();
        this.json = json;
        var http = new SimpleClientHttpRequestFactory();
        http.setConnectTimeout(Duration.ofSeconds(2));
        http.setReadTimeout(Duration.ofSeconds(3));
        client = RestClient.builder().requestFactory(http).build();
    }

    boolean enabled() { return !key.isEmpty(); }

    AddressSearchController.Results search(String query, int page, int limit) {
        var form = new LinkedMultiValueMap<String, String>();
        form.add("confmKey", key);
        form.add("keyword", query);
        form.add("currentPage", Integer.toString(page));
        form.add("countPerPage", Integer.toString(limit));
        form.add("resultType", "json");
        try {
            byte[] data = client.post().uri(ENDPOINT).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form).retrieve().body(byte[].class);
            if (data == null) throw unavailable();
            return read(json.readTree(data), page, limit);
        } catch (IOException | RestClientException e) {
            // Upstream exceptions may include request/response details. Return a credential-free error.
            throw unavailable();
        }
    }

    static AddressSearchController.Results read(JsonNode body, int page, int limit) {
        if (body == null) throw unavailable();
        JsonNode results = body.path("results");
        JsonNode common = results.path("common");
        if (!"0".equals(common.path("errorCode").asText())) throw unavailable();
        int total = common.path("totalCount").asInt(-1);
        JsonNode rows = results.path("juso");
        if (total < 0 || (total > 0 && !rows.isArray())) throw unavailable();
        var items = new ArrayList<AddressSuggestion>();
        for (JsonNode row : rows) {
            String code = row.path("admCd").asText("");
            if (!DONG_CODE.matcher(code).matches()) continue;
            String road = row.path("roadAddrPart1").asText("");
            if (road.isBlank()) road = row.path("roadAddr").asText("");
            AddressSuggestion.from(road, row.path("jibunAddr").asText(""), row.path("zipNo").asText(""),
                    row.path("siNm").asText(""), row.path("sggNm").asText(""), code.substring(0, 5))
                    .ifPresent(items::add);
        }
        return new AddressSearchController.Results(items, total > (long)page * limit, "national");
    }

    static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "주소 목록에 연결할 수 없어요. 다시 시도하거나 카카오 주소 검색을 이용해주세요.");
    }
}
