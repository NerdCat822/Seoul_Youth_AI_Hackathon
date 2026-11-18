package kr.trylog.overview;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class OverviewController {
    private final Clock clock;
    private final String storeName;

    public OverviewController(Clock clock, @Value("${trylog.store-name}") String storeName) {
        this.clock = clock;
        this.storeName = storeName;
    }

    public record Overview(String storeName, LocalDate today, String storageMode, boolean demo) { }

    @GetMapping("/overview")
    public Overview overview() {
        return new Overview(storeName, LocalDate.now(clock), "MEMORY", true);
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
