package kr.trylog.experiment;

import java.util.List;
import java.util.Optional;

/** Replace this implementation when persistence is introduced; keep API DTOs independent. */
public interface ExperimentRepository {
    List<Experiment> findAllNewestFirst();

    Optional<Experiment> findById(String id);

    Experiment save(Experiment experiment);
}
