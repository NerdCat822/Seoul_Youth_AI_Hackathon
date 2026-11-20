package kr.trylog.experiment;

import java.time.LocalDate;

public record ExperimentResponse(
        String id,
        String title,
        Category category,
        LocalDate startDate,
        LocalDate endDate,
        LocalDate checkDate,
        String notes,
        Status status) {

    public enum Status { PLANNED, IN_PROGRESS, READY, COMPLETED }

    public static ExperimentResponse from(Experiment experiment, LocalDate today) {
        LocalDate checkDate = experiment.endDate().plusDays(1);
        Status status = experiment.report() != null ? Status.COMPLETED
                : today.isBefore(experiment.startDate()) ? Status.PLANNED
                : today.isBefore(checkDate) ? Status.IN_PROGRESS : Status.READY;
        return new ExperimentResponse(experiment.id(), experiment.title(), experiment.category(),
                experiment.startDate(), experiment.endDate(), checkDate, experiment.notes(), status);
    }
}
