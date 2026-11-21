package kr.trylog.address;

import java.text.Normalizer;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import kr.trylog.shared.InvalidInputException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class AddressSearchController {
    private static final int LIMIT = 10;
    private static final Pattern SPACES = Pattern.compile("(?U)\\s+");
    private static final Set<String> CATALOG_REGIONS = Set.of("서울", "서울시", "서울특별시", "여의동", "여의도동");
    private final LocalAddressDirectory local;
    private final JusoAddressClient national;

    public record Results(List<AddressSuggestion> suggestions, boolean hasMore, String coverage) {}

    AddressSearchController(LocalAddressDirectory local, JusoAddressClient national) {
        this.local = local;
        this.national = national;
    }

    @GetMapping("/api/v1/addresses/search")
    public Results search(@RequestParam("q") String input, @RequestParam(name = "page", defaultValue = "1") String pageInput,
                          @RequestParam(name = "coverage", defaultValue = "auto") String coverage) {
        String query = SPACES.matcher(Normalizer.normalize(input, Normalizer.Form.NFKC)).replaceAll(" ").strip();
        if (query.length() < 2 || query.length() > 100) {
            throw new InvalidInputException(Map.of("q", "동 이름, 도로명 또는 지번을 2~100자로 입력해주세요."));
        }
        int page;
        try {
            page = Integer.parseInt(pageInput);
            if (page < 1) throw new NumberFormatException();
        } catch (NumberFormatException e) {
            throw new InvalidInputException(Map.of("page", "페이지는 1 이상의 정수로 입력해주세요."));
        }
        if (!Set.of("auto", "local", "national").contains(coverage)) {
            throw new InvalidInputException(Map.of("coverage", "주소 검색 범위를 확인해주세요."));
        }
        if ("local".equals(coverage)) return local.search(query, page, LIMIT);
        if ("national".equals(coverage)) {
            if (!national.enabled()) throw JusoAddressClient.unavailable();
            return national.search(query, page, LIMIT);
        }
        // The catalog includes administrative as well as legal dong names in its covered regions.
        if (!national.enabled() || List.of(query.split(" ")).stream().anyMatch(CATALOG_REGIONS::contains)) {
            return local.search(query, page, LIMIT);
        }
        try {
            var result = national.search(query, page, LIMIT);
            if (!result.suggestions().isEmpty() || page > 1) return result;
            var nearby = local.search(query, page, LIMIT);
            return nearby.suggestions().isEmpty() ? result : nearby;
        } catch (ResponseStatusException e) {
            if (page > 1) throw e;
            var nearby = local.search(query, page, LIMIT);
            if (nearby.suggestions().isEmpty()) throw e;
            return nearby;
        }
    }
}
