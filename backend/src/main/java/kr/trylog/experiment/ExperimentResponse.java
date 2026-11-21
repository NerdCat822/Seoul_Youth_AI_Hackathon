package kr.trylog.experiment;

import java.time.LocalDate;

public record ExperimentResponse(String id, int storeId, String title, String category, String actionType,
                                 String targetMenuCode, LocalDate startDate, LocalDate endDate,
                                 LocalDate checkDate, String notes, Status status) {
    public enum Status { PLANNED, IN_PROGRESS, READY, COMPLETED }

    static ExperimentResponse from(Experiment experiment, LocalDate today) {
        LocalDate checkDate = experiment.endDate().plusDays(1);
        Status status = today.isBefore(experiment.startDate()) ? Status.PLANNED
                : today.isBefore(checkDate) ? Status.IN_PROGRESS : Status.READY;
        return new ExperimentResponse(experiment.id(), experiment.storeId(), experiment.title(),
                experiment.category(), experiment.actionType(), experiment.targetMenuCode(),
                experiment.startDate(), experiment.endDate(), checkDate, experiment.notes(), status);
    }
}
