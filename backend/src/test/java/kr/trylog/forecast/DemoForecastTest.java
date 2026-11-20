package kr.trylog.forecast;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

class DemoForecastTest {
    @Test
    void matchesIndependentAggregationOfStoreOnePosAndSameWeekdayHoldout() {
        DemoForecast report = DemoForecast.fromSample();

        assertThat(report.dataThrough()).isEqualTo(LocalDate.of(2026, 11, 20));
        assertThat(report.demo()).isTrue();
        assertThat(report.validation()).isEqualTo(new DemoForecast.Validation(
                LocalDate.of(2026, 10, 24), LocalDate.of(2026, 11, 20),
                28, 92770, 14.85, 111704, 17.88));
        assertThat(report.historical()).isEqualTo(new DemoForecast.Historical(
                LocalDate.of(2026, 11, 7), LocalDate.of(2026, 11, 20),
                9329700, 9032900, 296800));
        assertThat(report.candidate().model()).isEqualTo("LightGBM 4.6.0");
        assertThat(report.candidate().mae()).isEqualTo(80843);
        assertThat(report.candidate().wape()).isEqualTo(12.94);
        assertThat(report.candidate().errorRadius()).isEqualTo(114047);
        assertThat(report.candidate().days()).extracting(DemoForecast.CandidateDay::date)
                .containsExactlyElementsOf(report.days().stream().map(DemoForecast.Day::date).toList());
        assertThat(report.candidate().days()).extracting(DemoForecast.CandidateDay::expected)
                .containsExactly(772372L, 789363L, 626672L, 613996L, 625962L, 619702L, 610550L);
        assertThat(report.days()).hasSize(7);
        assertThat(report.days().get(0)).isEqualTo(new DemoForecast.Day(
                LocalDate.of(2026, 11, 21), 740025, 578100, 901950));
        assertThat(report.days().get(6)).isEqualTo(new DemoForecast.Day(
                LocalDate.of(2026, 11, 27), 544550, 382625, 706475));
    }

    @Test
    void changingFirstWeekActualSalesDoesNotChangeSecondWeekForecast() {
        var sales = new TreeMap<LocalDate, Long>();
        LocalDate start = LocalDate.of(2026, 11, 7);
        LocalDate end = start.plusDays(13);
        for (LocalDate day = start.minusWeeks(4); !day.isAfter(end); day = day.plusDays(1)) {
            sales.put(day, 10000L);
        }
        sales.put(start, 1000000L);

        assertThat(DemoForecast.comparePeriod(sales, start, end))
                .isEqualTo(new DemoForecast.Historical(start, end, 1130000, 140000, 990000));
    }
}
