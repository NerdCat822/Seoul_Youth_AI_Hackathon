package kr.ganum.experiment;

import java.time.LocalDate;

public record Experiment(
        String id,
        String title,
        Category category,
        LocalDate startDate,
        LocalDate endDate,
        String notes) {
}
