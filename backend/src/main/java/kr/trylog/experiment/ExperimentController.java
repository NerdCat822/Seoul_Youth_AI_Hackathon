package kr.trylog.experiment;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/experiments")
public class ExperimentController {
    private final ExperimentService service;

    public ExperimentController(ExperimentService service) {
        this.service = service;
    }

    @GetMapping
    public List<ExperimentResponse> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public ExperimentResponse find(@PathVariable String id) {
        return service.find(id);
    }

    @PostMapping
    public ResponseEntity<ExperimentResponse> create(@Valid @RequestBody CreateExperimentRequest request) {
        ExperimentResponse result = service.create(request);
        return ResponseEntity.created(URI.create("/api/v1/experiments/" + result.id())).body(result);
    }
}
