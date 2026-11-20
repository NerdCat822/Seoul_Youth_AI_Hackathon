package kr.trylog.experiment;

import java.time.LocalDate;
import kr.trylog.report.SalesReport;

public record Experiment(
        String id,
        String title,
        Category category,
        LocalDate startDate,
        LocalDate endDate,
        String notes,
        SalesReport report) {

    public Experiment withReport(SalesReport newReport) {
        return new Experiment(id, title, category, startDate, endDate, notes, newReport);
    }
}
