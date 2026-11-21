package kr.trylog.shared;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.TransactionException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    public record ApiError(String code, String message, Map<String, String> fieldErrors) { }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException exception) {
        Map<String, String> fields = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(error ->
                fields.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return invalid(fields);
    }

    @ExceptionHandler(InvalidInputException.class)
    ResponseEntity<ApiError> invalidInput(InvalidInputException exception) {
        return invalid(exception.fieldErrors());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiError> invalidParameter(MethodArgumentTypeMismatchException exception) {
        return invalid(Map.of(exception.getName(), "입력 형식을 확인해주세요."));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> uploadTooLarge(MaxUploadSizeExceededException exception) {
        String message = "5MB 이내의 주문 파일을 선택해주세요.";
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(new ApiError("VALIDATION_ERROR", message, Map.of("file", message)));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> malformedJson(HttpMessageNotReadableException exception) {
        return ResponseEntity.badRequest().body(new ApiError("VALIDATION_ERROR",
                "입력 형식을 확인해주세요. 날짜는 YYYY-MM-DD 형식으로 입력해주세요.", Map.of()));
    }

    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiError> notFound(NotFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ApiError("NOT_FOUND", exception.getMessage(), Map.of()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> routeNotFound(NoResourceFoundException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ApiError("NOT_FOUND", "요청한 경로를 찾을 수 없어요.", Map.of()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiError> requestStatus(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).headers(exception.getHeaders())
                .body(new ApiError("REQUEST_ERROR", exception.getReason(), Map.of()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception exception) {
        if (exception instanceof ErrorResponse errorResponse) {
            return ResponseEntity.status(errorResponse.getStatusCode()).headers(errorResponse.getHeaders())
                    .body(new ApiError("REQUEST_ERROR", "요청 경로, 메서드와 Content-Type을 확인해주세요.", Map.of()));
        }
        log.error("Unexpected API error", exception);
        return ResponseEntity.internalServerError()
                .body(new ApiError("INTERNAL_ERROR", "잠시 후 다시 시도해주세요.", Map.of()));
    }

    @ExceptionHandler(ReadOnlyException.class)
    ResponseEntity<ApiError> readOnly(ReadOnlyException exception) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ApiError("READ_ONLY", exception.getMessage(), Map.of()));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<ApiError> databaseUnavailable(RuntimeException exception) {
        log.warn("Database request failed ({})", exception.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ApiError("DATABASE_UNAVAILABLE", "가게 자료를 읽을 수 없어요. DB 연결과 권한을 확인해주세요.", Map.of()));
    }

    private ResponseEntity<ApiError> invalid(Map<String, String> fields) {
        return ResponseEntity.badRequest()
                .body(new ApiError("VALIDATION_ERROR", "입력 내용을 확인해주세요.", fields));
    }
}
