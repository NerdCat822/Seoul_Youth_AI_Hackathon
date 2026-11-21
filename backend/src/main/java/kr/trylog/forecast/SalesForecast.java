package kr.trylog.forecast;

import java.time.LocalDate;
import java.util.List;

public record SalesForecast(int storeId, String storeName, String status, String source, LocalDate dataThrough,
                            String model, List<Day> days, String rangeMethod, Validation validation,
                            Historical historical, Candidate candidate, List<LocalDate> missingDates) {
    public record Day(LocalDate date, long expected, Long lower, Long upper) {}
    public record Validation(LocalDate startDate, LocalDate endDate, int days, long mae, Double wape,
                             long baselineMae, Double baselineWape) {}
    public record Historical(LocalDate startDate, LocalDate endDate, long actual, long expected, long difference) {}
    public record Candidate(String model, long mae, Double wape, long errorRadius, List<CandidateDay> days) {}
    public record CandidateDay(LocalDate date, long expected) {}
}
