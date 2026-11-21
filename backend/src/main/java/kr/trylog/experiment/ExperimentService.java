package kr.trylog.experiment;

import java.time.Clock;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.trylog.overview.StoreRepository;
import kr.trylog.shared.InvalidInputException;
import kr.trylog.shared.NotFoundException;
import kr.trylog.shared.ReadOnlyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ExperimentService {
    private static final LocalDate MIN_DATE = LocalDate.of(2000, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(2100, 12, 31);
    private final ExperimentRepository repository;
    private final Clock clock;
    private final StoreRepository stores;

    public ExperimentService(ExperimentRepository repository, Clock clock, StoreRepository stores) {
        this.repository = repository;
        this.clock = clock;
        this.stores = stores;
    }

    public List<ExperimentResponse> list() {
        LocalDate today = LocalDate.now(clock);
        stores.storeName();
        return repository.findAll(stores.storeId()).stream()
                .map(experiment -> ExperimentResponse.from(experiment, today)).toList();
    }

    public ExperimentResponse find(String id) {
        return response(repository.findById(stores.storeId(), id)
                .orElseThrow(() -> new NotFoundException("시도를 찾을 수 없어요.")));
    }

    @Transactional
    public ExperimentResponse create(CreateExperimentRequest request, String retryKey) {
        Map<String, String> errors = new LinkedHashMap<>();
        validateDate("startDate", request.startDate(), errors);
        validateDate("endDate", request.endDate(), errors);
        if (request.startDate().isAfter(request.endDate())) {
            errors.put("endDate", "종료일은 시작일과 같거나 이후여야 해요.");
        }
        if (!errors.isEmpty()) {
            throw new InvalidInputException(errors);
        }
        if (!stores.writeEnabled()) {
            throw new ReadOnlyException();
        }
        stores.storeName();
        if (request.targetMenuCode() != null) {
            stores.requireMenu(request.targetMenuCode());
        }
        int storeId = stores.storeId();
        String id = createId(storeId, retryKey);
        Experiment experiment = new Experiment(id, storeId, request.title(), request.category().name(),
                request.actionType(), request.targetMenuCode(), request.startDate(), request.endDate(), request.notes());
        return response(repository.insert(experiment));
    }

    private static String createId(int storeId, String retryKey) {
        if (retryKey == null) {
            return UUID.randomUUID().toString();
        }
        try {
            UUID key = UUID.fromString(retryKey);
            if (key.toString().equalsIgnoreCase(retryKey)) {
                String scopedKey = "trylog:experiment:" + storeId + ":" + key;
                return UUID.nameUUIDFromBytes(scopedKey.getBytes(StandardCharsets.UTF_8)).toString();
            }
        } catch (IllegalArgumentException ignored) {
            // A retry key must identify one form submission.
        }
        throw new InvalidInputException(Map.of("Idempotency-Key", "저장 요청 키는 UUID 형식이어야 해요."));
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
