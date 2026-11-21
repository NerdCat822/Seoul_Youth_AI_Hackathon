package kr.trylog.experiment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record CreateExperimentRequest(
        @NotBlank(message = "제목을 입력해주세요.")
        @Size(max = 80, message = "제목은 80자 이내로 입력해주세요.") String title,
        @NotNull(message = "종류를 선택해주세요.") Category category,
        @NotBlank(message = "행동 유형을 선택해주세요.")
        @Size(max = 30, message = "행동 유형은 30자 이내로 입력해주세요.") String actionType,
        @Size(max = 20, message = "메뉴 코드는 20자 이내로 입력해주세요.") String targetMenuCode,
        @NotNull(message = "시작일을 입력해주세요.") LocalDate startDate,
        @NotNull(message = "종료일을 입력해주세요.") LocalDate endDate,
        @Size(max = 500, message = "메모는 500자 이내로 입력해주세요.") String notes) {

    public CreateExperimentRequest {
        title = title == null ? null : title.strip();
        actionType = actionType == null ? null : actionType.strip();
        targetMenuCode = targetMenuCode == null || targetMenuCode.isBlank() ? null : targetMenuCode.strip();
        notes = notes == null ? "" : notes;
    }
}
