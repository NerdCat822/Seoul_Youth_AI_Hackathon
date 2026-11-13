package kr.ganum.experiment;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Repository;

/** Local demo storage only. Records disappear when this application stops. */
@Repository
public class InMemoryExperimentRepository implements ExperimentRepository {
    private final Map<String, Experiment> experiments = new LinkedHashMap<>();

    @Override
    public synchronized List<Experiment> findAllNewestFirst() {
        List<Experiment> result = new ArrayList<>(experiments.values());
        Collections.reverse(result);
        return List.copyOf(result);
    }

    @Override
    public synchronized Optional<Experiment> findById(String id) {
        return Optional.ofNullable(experiments.get(id));
    }

    @Override
    public synchronized Experiment save(Experiment experiment) {
        experiments.put(experiment.id(), experiment);
        return experiment;
    }
}
