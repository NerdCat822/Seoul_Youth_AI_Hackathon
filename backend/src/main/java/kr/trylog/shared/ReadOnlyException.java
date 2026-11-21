package kr.trylog.shared;

public class ReadOnlyException extends RuntimeException {
    public ReadOnlyException() {
        super("현재 연결은 읽기 전용이에요. 새 기록을 저장할 수 없어요.");
    }
}
