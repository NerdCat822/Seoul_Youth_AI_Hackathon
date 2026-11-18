package kr.trylog.shared;

import java.util.Map;

public class InvalidInputException extends RuntimeException {
    private final Map<String, String> fieldErrors;

    public InvalidInputException(Map<String, String> fieldErrors) {
        super("입력 내용을 확인해주세요.");
        this.fieldErrors = Map.copyOf(fieldErrors);
    }

    public Map<String, String> fieldErrors() {
        return fieldErrors;
    }
}
