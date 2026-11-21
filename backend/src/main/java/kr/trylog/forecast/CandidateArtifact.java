package kr.trylog.forecast;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.NavigableMap;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class CandidateArtifact {
    record TrainingRun(int storeId, LocalDate dataThrough, String historySha256, SalesForecast.Candidate candidate) {}
    private final TrainingRun run;

    public CandidateArtifact(ObjectMapper mapper, @Value("${TRYLOG_FORECAST_CANDIDATE:}") String path) {
        TrainingRun loaded = null;
        if (!path.isBlank()) {
            try {
                loaded = mapper.readValue(Path.of(path).toFile(), TrainingRun.class);
            } catch (IOException e) {
                LoggerFactory.getLogger(getClass()).warn("대체 전망 모델 파일을 읽을 수 없어 기본 전망을 사용합니다.");
            }
        }
        this.run = loaded;
    }

    SalesForecast.Candidate forHistory(int store, NavigableMap<LocalDate, Long> history) {
        if (run == null || store != run.storeId() || !history.lastKey().equals(run.dataThrough())
                || !fingerprint(history).equals(run.historySha256())) return null;
        var model = run.candidate();
        if (model == null || model.model() == null || model.model().isBlank() || model.mae() < 0 || model.errorRadius() < 0
                || (model.wape() != null && (!Double.isFinite(model.wape()) || model.wape() < 0))
                || model.days() == null || model.days().size() != 7) return null;
        for (int i = 0; i < 7; i++) {
            var day = model.days().get(i);
            if (day == null || !run.dataThrough().plusDays(i + 1).equals(day.date()) || day.expected() < 0) return null;
        }
        return model;
    }

    static String fingerprint(NavigableMap<LocalDate, Long> history) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            history.forEach((date, value) -> digest.update((date + "," + value + "\n").getBytes(StandardCharsets.UTF_8)));
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
