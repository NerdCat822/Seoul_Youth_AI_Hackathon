package kr.trylog.report;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import kr.trylog.experiment.Experiment;
import kr.trylog.experiment.ExperimentRepository;
import kr.trylog.shared.InvalidInputException;
import kr.trylog.shared.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ReportService {
    private final ExperimentRepository experiments;
    private final Clock clock;

    public ReportService(ExperimentRepository experiments, Clock clock) {
        this.experiments = experiments;
        this.clock = clock;
    }

    public SalesReport find(String id) {
        SalesReport report = experiment(id).report();
        if (report == null) {
            throw new NotFoundException("아직 저장된 결과가 없어요.");
        }
        return report;
    }

    public SalesReport analyze(String id, MultipartFile file, String menuCode) {
        Experiment experiment = experiment(id);
        if (!LocalDate.now(clock).isAfter(experiment.endDate())) {
            throw new InvalidInputException(Map.of("checkDate",
                    experiment.endDate().plusDays(1) + "부터 결과를 확인할 수 있어요."));
        }
        if (menuCode.isEmpty() || menuCode.length() > 20) {
            throw new InvalidInputException(Map.of("targetMenuCode", "대상 메뉴 코드를 1~20자로 입력해주세요."));
        }
        SalesComparison comparison = new SalesComparison(experiment.startDate(), comparisonDays(experiment), menuCode);
        PosFileReader.read(file, comparison);
        SalesReport report = comparison.result();
        experiments.save(experiment.withReport(report));
        return report;
    }

    public String sample(String id) {
        Experiment experiment = experiment(id);
        int days = comparisonDays(experiment);
        StringBuilder csv = new StringBuilder("base_date,receipt_id,store_id,menu2_cd,price,quantity,is_refunded\r\n");
        samplePeriod(csv, experiment.startDate().minusDays(14), days, 100, 42);
        samplePeriod(csv, experiment.startDate(), days, 160, 58);
        return csv.toString();
    }

    private void samplePeriod(StringBuilder csv, LocalDate start, int days, int total, int target) {
        for (int i = 0; i < total; i++) {
            LocalDate date = start.plusDays(i % days);
            csv.append(date).append(",S").append(i).append(",1,")
                    .append(i < target ? "MENU01" : "MENU02").append(",5000,1,false\r\n");
        }
    }

    private int comparisonDays(Experiment experiment) {
        return (int) Math.min(14, ChronoUnit.DAYS.between(experiment.startDate(), experiment.endDate()) + 1);
    }

    private Experiment experiment(String id) {
        return experiments.findById(id).orElseThrow(() -> new NotFoundException("시도를 찾을 수 없어요."));
    }
}
