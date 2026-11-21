package kr.trylog.forecast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.TreeMap;
import kr.trylog.overview.StoreRepository;
import org.junit.jupiter.api.Test;

class UpcomingForecastTest {
    @Test
    void aMissingTradingDayLeavesOnlyItsMatchingWeekdayUnknown() {
        LocalDate today = LocalDate.of(2026, 12, 31);
        var zone = ZoneId.of("Asia/Seoul");
        var clock = Clock.fixed(today.atStartOfDay(zone).toInstant(), zone);
        var stores = mock(StoreRepository.class);
        var repository = mock(ForecastRepository.class);
        when(stores.storeId()).thenReturn(2);
        when(repository.predictions(2, today)).thenReturn(List.of());
        var history = new TreeMap<LocalDate, Long>();
        for (int i = 1; i <= 27; i++) history.put(today.minusDays(i), 0L);
        when(repository.history(2, today.minusDays(27), today)).thenReturn(history);

        var week = new ForecastController(stores, repository, clock, null).upcomingSales();

        assertThat(week).extracting(ForecastController.UpcomingSales::date)
                .containsExactlyElementsOf(today.plusDays(1).datesUntil(today.plusDays(8)).toList());
        assertThat(week).extracting(ForecastController.UpcomingSales::expected)
                .containsExactly(0L, 0L, 0L, 0L, 0L, 0L, null);
    }
}
