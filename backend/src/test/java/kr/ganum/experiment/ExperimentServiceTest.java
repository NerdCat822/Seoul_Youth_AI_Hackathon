package kr.ganum.experiment;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class ExperimentServiceTest {
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-13T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Test
    void statusUsesStartAndCheckDatesIncludingBoundaries() {
        ExperimentService service = new ExperimentService(new InMemoryExperimentRepository(), clock);
        assertThat(service.create(request("2026-11-14", "2026-11-27")).status())
                .isEqualTo(ExperimentResponse.Status.PLANNED);
        assertThat(service.create(request("2026-11-13", "2026-11-26")).status())
                .isEqualTo(ExperimentResponse.Status.IN_PROGRESS);
        assertThat(service.create(request("2026-11-01", "2026-11-13")).status())
                .isEqualTo(ExperimentResponse.Status.IN_PROGRESS);
        assertThat(service.create(request("2026-11-01", "2026-11-12")).status())
                .isEqualTo(ExperimentResponse.Status.READY);
    }

    @Test
    void repositoryListsNewestFirstAndNewInstanceIsEmpty() {
        ExperimentService service = new ExperimentService(new InMemoryExperimentRepository(), clock);
        ExperimentResponse first = service.create(request("2026-11-13", "2026-11-26"));
        ExperimentResponse second = service.create(request("2026-11-14", "2026-11-27"));
        assertThat(service.list()).extracting(ExperimentResponse::id).containsExactly(second.id(), first.id());
        assertThat(new ExperimentService(new InMemoryExperimentRepository(), clock).list()).isEmpty();
    }

    @Test
    void statusIsRecalculatedWhenClockChanges() {
        InMemoryExperimentRepository repository = new InMemoryExperimentRepository();
        ExperimentResponse created = new ExperimentService(repository, clock)
                .create(request("2026-11-13", "2026-11-26"));
        Clock later = Clock.fixed(Instant.parse("2026-11-27T00:00:00Z"), ZoneId.of("Asia/Seoul"));
        assertThat(new ExperimentService(repository, later).find(created.id()).status())
                .isEqualTo(ExperimentResponse.Status.READY);
    }

    private CreateExperimentRequest request(String start, String end) {
        return new CreateExperimentRequest("추천 표시", Category.MENU,
                LocalDate.parse(start), LocalDate.parse(end), null);
    }
}
