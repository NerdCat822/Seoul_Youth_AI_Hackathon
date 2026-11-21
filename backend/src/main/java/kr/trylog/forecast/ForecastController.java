package kr.trylog.forecast;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import kr.trylog.overview.StoreRepository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ForecastController {
    public record UpcomingSales(LocalDate date, Long expected) {}
    public record WeatherDay(LocalDate date, Double averageTempC, Double precipitationMm) {}

    private final StoreRepository stores;
    private final ForecastRepository repository;
    private final Clock clock;
    private final CandidateArtifact candidate;

    public ForecastController(StoreRepository stores, ForecastRepository repository, Clock clock, CandidateArtifact candidate) {
        this.stores = stores;
        this.repository = repository;
        this.clock = clock;
        this.candidate = candidate;
    }

    @GetMapping("/api/v1/forecast/week")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<UpcomingSales> upcomingSales() {
        int store = stores.storeId();
        LocalDate today = LocalDate.now(clock);
        var stored = repository.predictions(store, today);
        if (stored.size() == 7) {
            return stored.stream().map(ForecastRepository.StoredDay::day)
                    .map(day -> new UpcomingSales(day.date(), day.expected())).toList();
        }
        // The seven estimates use only the four previous occurrences of each weekday.
        var history = repository.history(store, today.minusDays(27), today);
        return today.plusDays(1).datesUntil(today.plusDays(8))
                .map(date -> new UpcomingSales(date, WeekdayModel.estimate(history, date))).toList();
    }

    @GetMapping("/api/v1/weather/week")
    @Transactional(readOnly = true)
    public List<WeatherDay> upcomingWeather() {
        LocalDate today = LocalDate.now(clock);
        return repository.weather(today.plusDays(1), today.plusDays(7));
    }

    @GetMapping("/api/v1/demo/forecast")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SalesForecast forecast() {
        int store = stores.storeId();
        String name = stores.storeName();
        var history = repository.history(store, null, LocalDate.now(clock));
        if (history.isEmpty()) return insufficient(store, name, null, List.of());
        var through = history.lastKey();
        var period = repository.lastExperiment(store, through);
        var historical = period.isEmpty() ? null : WeekdayModel.historical(history, period.get(0).start(), period.get(0).end());
        var predictions = repository.predictions(store, through);
        if (predictions.size() == 7) {
            return new SalesForecast(store, name, "READY", "DATABASE_PREDICTIONS", through, predictions.get(0).model(),
                    predictions.stream().map(ForecastRepository.StoredDay::day).toList(), "DB에 저장된 모델의 예상 범위",
                    null, historical, null, List.of());
        }
        var missing = WeekdayModel.missingDates(history, through);
        if (!missing.isEmpty()) return insufficient(store, name, through, missing);
        var evaluation = WeekdayModel.validate(history, through);
        return new SalesForecast(store, name, "READY", "DB_HISTORY", through, WeekdayModel.NAME,
                WeekdayModel.predict(history, through, evaluation == null ? null : evaluation.radius()),
                evaluation == null ? null : "최근 28일 검증 절대오차의 80번째 백분위로 계산한 참고 범위",
                evaluation == null ? null : evaluation.metrics(), historical, candidate.forHistory(store, history), List.of());
    }

    private static SalesForecast insufficient(int store, String name, LocalDate through, List<LocalDate> missing) {
        return new SalesForecast(store, name, "INSUFFICIENT_DATA", "DB_HISTORY", through, null, List.of(),
                null, null, null, null, missing);
    }
}
