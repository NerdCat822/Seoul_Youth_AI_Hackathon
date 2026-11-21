package kr.trylog.forecast;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

class WeekdayModelTest {
    private final LocalDate through = LocalDate.of(2026, 11, 20);
    private final Path fixtures = Path.of("src/test/resources/forecast");

    @Test
    void reproducesAppendixFromTradingDatesAndPinsCandidateToExactHistory() throws Exception {
        var history = new TreeMap<LocalDate, Long>();
        for (String line : Files.readAllLines(fixtures.resolve("store1-daily-sales.csv")).subList(1, 113)) {
            String[] values = line.split(",");
            history.put(LocalDate.parse(values[0]), Long.parseLong(values[1]));
        }
        assertThat(WeekdayModel.missingDates(history, through)).isEmpty();
        var result = WeekdayModel.validate(history, through);
        assertThat(result.metrics()).isEqualTo(new SalesForecast.Validation(through.minusDays(27), through, 28,
                92770, 14.85, 111704, 17.88));
        assertThat(result.radius()).isEqualTo(161925);
        assertThat(WeekdayModel.predict(history, through, result.radius()).get(0)).isEqualTo(
                new SalesForecast.Day(through.plusDays(1), 740025, 578100L, 901950L));
        var historicalStart = LocalDate.of(2026, 11, 7);
        assertThat(WeekdayModel.historical(history, historicalStart, through)).isEqualTo(
                new SalesForecast.Historical(historicalStart, through, 9329700, 9032900, 296800));
        var artifact = new CandidateArtifact(JsonMapper.builder().addModule(new JavaTimeModule()).build(),
                fixtures.resolve("store1-lightgbm.json").toString());
        assertThat(artifact.forHistory(1, history).mae()).isEqualTo(80843);
        assertThat(artifact.forHistory(2, history)).isNull();
        history.put(through, history.get(through) + 1);
        assertThat(artifact.forHistory(1, history)).isNull();
    }

    @Test
    void reportsMissingCalendarDatesAndUndefinedValidationMetrics() {
        var history = new TreeMap<LocalDate, Long>();
        for (int day = 0; day < 56; day++) history.put(through.minusDays(day), 0L);
        assertThat(WeekdayModel.validate(history, through).metrics().wape()).isNull();
        history.remove(through.minusDays(18));
        assertThat(WeekdayModel.missingDates(history, through)).containsExactly(through.minusDays(18));
        assertThat(WeekdayModel.validate(history, through)).isNull();
    }
}
