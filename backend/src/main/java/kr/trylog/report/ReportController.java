package kr.trylog.report;

import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/experiments/{id}")
public class ReportController {
    private final ReportService service;

    public ReportController(ReportService service) {
        this.service = service;
    }

    @GetMapping("/report")
    public SalesReport find(@PathVariable String id) {
        return service.find(id);
    }

    @GetMapping("/report/preview")
    public SalesReport preview(@PathVariable String id, @RequestParam(required = false) String targetMenuCode) {
        return service.fromDatabase(id, targetMenuCode);
    }

    public record Selection(String targetMenuCode) {}

    @PostMapping(value = "/report/from-db", consumes = MediaType.APPLICATION_JSON_VALUE)
    public SalesReport fromDatabase(@PathVariable String id, @RequestBody Selection selection) {
        return service.fromDatabase(id, selection.targetMenuCode());
    }

    @PostMapping(value = "/report", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SalesReport upload(@PathVariable String id,
                              @RequestParam(required = false) MultipartFile file,
                              @RequestParam(defaultValue = "") String targetMenuCode) {
        return service.analyze(id, file, targetMenuCode.strip());
    }

    @GetMapping("/sample.csv")
    public ResponseEntity<byte[]> sample(@PathVariable String id, @RequestParam(required = false) String targetMenuCode) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"trylog-sample.csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(service.sample(id, targetMenuCode).getBytes(StandardCharsets.UTF_8));
    }
}
