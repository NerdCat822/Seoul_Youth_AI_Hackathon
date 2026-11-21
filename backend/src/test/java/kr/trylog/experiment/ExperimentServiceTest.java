package kr.trylog.experiment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import kr.trylog.overview.StoreRepository;
import kr.trylog.shared.InvalidInputException;
import kr.trylog.shared.ReadOnlyException;
import org.junit.jupiter.api.Test;

class ExperimentServiceTest {
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-20T15:01:00Z"), ZoneId.of("Asia/Seoul"));
    private final ExperimentRepository records = mock(ExperimentRepository.class);
    private final StoreRepository stores = mock(StoreRepository.class);
    private final ExperimentService service = new ExperimentService(records, clock, stores);

    @Test
    void statusChangesOnStartAndTheDayAfterEndInSeoul() {
        LocalDate start = LocalDate.of(2026, 11, 21);
        Experiment record = new Experiment("test", 1, "기록", "MENU", "MENU_BADGE", "M1",
                start, start.plusDays(1), "");
        assertThat(ExperimentResponse.from(record, start.minusDays(1)).status()).isEqualTo(ExperimentResponse.Status.PLANNED);
        assertThat(ExperimentResponse.from(record, LocalDate.now(clock)).status()).isEqualTo(ExperimentResponse.Status.IN_PROGRESS);
        assertThat(ExperimentResponse.from(record, start.plusDays(1)).status()).isEqualTo(ExperimentResponse.Status.IN_PROGRESS);
        assertThat(ExperimentResponse.from(record, start.plusDays(2)).status()).isEqualTo(ExperimentResponse.Status.READY);
    }

    @Test
    void validatesBothDateBoundsBeforeAnyDatabaseWrite() {
        assertThatThrownBy(() -> service.create(request("1999-12-31", "2101-01-01"), null))
                .isInstanceOfSatisfying(InvalidInputException.class,
                        error -> assertThat(error.fieldErrors()).containsKeys("startDate", "endDate"));
        assertThatThrownBy(() -> service.create(request("2026-11-21", "2026-11-20"), null))
                .isInstanceOfSatisfying(InvalidInputException.class,
                        error -> assertThat(error.fieldErrors()).containsOnlyKeys("endDate"));
        verifyNoInteractions(records, stores);
    }

    @Test
    void sharedReadOnlyModePreventsInsert() {
        assertThatThrownBy(() -> service.create(request("2026-11-20", "2026-11-20"), null))
                .isInstanceOf(ReadOnlyException.class);
        verifyNoInteractions(records);
    }

    @Test
    void retryKeyUsesSameIdOnlyWithinOneStore() {
        String key = "4eae8554-98c5-4a3b-bf56-56a44e37be92";
        when(stores.writeEnabled()).thenReturn(true);
        when(stores.storeId()).thenReturn(1, 1, 2);
        when(records.insert(any())).thenAnswer(call -> call.getArgument(0));
        var request = request("2026-11-07", "2026-11-20");
        String first = service.create(request, key).id();
        assertThat(service.create(request, key).id()).isEqualTo(first);
        assertThat(service.create(request, key).id()).isNotEqualTo(first);
        verify(stores, times(3)).requireMenu("M1");
    }

    private static CreateExperimentRequest request(String start, String end) {
        return new CreateExperimentRequest("기록", Category.MENU, "MENU_BADGE", "M1",
                LocalDate.parse(start), LocalDate.parse(end), "");
    }
}
