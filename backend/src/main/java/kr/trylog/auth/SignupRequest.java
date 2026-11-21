package kr.trylog.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record SignupRequest(
        @NotBlank(message = "로그인 아이디를 입력해주세요.")
        @Pattern(regexp = "[A-Za-z0-9._-]{4,40}", message = "영문, 숫자, 점, 밑줄, 하이픈으로 4~40자를 입력해주세요.") String loginId,
        @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) @NotBlank(message = "비밀번호를 입력해주세요.")
        @Size(min = 8, max = 128, message = "비밀번호는 8~128자로 입력해주세요.") String password,
        @NotBlank(message = "가게 이름을 입력해주세요.") @Size(max = 100, message = "가게 이름은 100자 이내로 입력해주세요.") String storeName,
        @NotBlank(message = "주소를 검색해주세요.") @Pattern(regexp = "[0-9]{5}", message = "우편번호는 5자리여야 해요.") String postalCode,
        @NotBlank(message = "주소를 검색해주세요.") @Size(max = 300, message = "주소는 300자 이내로 입력해주세요.") String address,
        @Size(max = 150, message = "상세 주소는 150자 이내로 입력해주세요.") String addressDetail,
        @NotBlank(message = "시도 코드를 확인해주세요.") @Pattern(regexp = "[0-9]{2}", message = "시도 코드는 2자리여야 해요.") String megaCd,
        @NotBlank(message = "시도 이름을 확인해주세요.") @Size(max = 30, message = "시도 이름은 30자 이내로 입력해주세요.") String megaNm,
        @NotBlank(message = "시군구 코드를 확인해주세요.") @Pattern(regexp = "[0-9]{5}", message = "시군구 코드는 5자리여야 해요.") String ctyCd,
        @NotBlank(message = "시군구 이름을 확인해주세요.") @Size(max = 30, message = "시군구 이름은 30자 이내로 입력해주세요.") String ctyNm,
        @NotBlank(message = "업종을 입력해주세요.") @Size(max = 50, message = "업종은 50자 이내로 입력해주세요.") String upjong,
        @NotNull(message = "영업 시작 시간을 입력해주세요.") LocalTime openTime,
        @NotNull(message = "영업 종료 시간을 입력해주세요.") LocalTime closeTime,
        @NotNull(message = "개업일을 입력해주세요.") LocalDate openedDate,
        @Size(max = 7, message = "휴무일은 최대 7개까지 선택해주세요.") List<@NotNull @Min(0) @Max(6) Integer> closedWeekdays) {
}
