package kr.trylog.experiment;

import java.time.Clock;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.trylog.shared.InvalidInputException;
import kr.trylog.shared.NotFoundException;
import org.springframework.stereotype.Service;

@Service
public class ExperimentService {
    private static final LocalDate MIN_DATE = LocalDate.of(2000, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(2100, 12, 31);
    private final ExperimentRepository repository;
    private final Clock clock;

    public ExperimentService(ExperimentRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public List<ExperimentResponse> list() {
        LocalDate today = LocalDate.now(clock);
        return repository.findAllNewestFirst().stream()
                .map(experiment -> ExperimentResponse.from(experiment, today)).toList();
    }

    public ExperimentResponse find(String id) {
        return response(repository.findById(id)
                .orElseThrow(() -> new NotFoundException("시도를 찾을 수 없어요.")));
    }

    public ExperimentResponse create(CreateExperimentRequest request) {
        Map<String, String> errors = new LinkedHashMap<>();
        validateDate("startDate", request.startDate(), errors);
        validateDate("endDate", request.endDate(), errors);
        if (request.startDate().isAfter(request.endDate())) {
            errors.put("endDate", "종료일은 시작일과 같거나 이후여야 해요.");
        }
        if (!errors.isEmpty()) {
            throw new InvalidInputException(errors);
        }
        Experiment experiment = new Experiment(UUID.randomUUID().toString(), request.title(),
                request.category(), request.startDate(), request.endDate(), request.notes());
        return response(repository.save(experiment));
    }

    private static void validateDate(String field, LocalDate date, Map<String, String> errors) {
        if (date.isBefore(MIN_DATE) || date.isAfter(MAX_DATE)) {
            errors.put(field, "날짜는 2000-01-01부터 2100-12-31 사이로 입력해주세요.");
        }
    }

    private ExperimentResponse response(Experiment experiment) {
        return ExperimentResponse.from(experiment, LocalDate.now(clock));
    }
}
