package kr.trylog.report;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import kr.trylog.experiment.ExperimentResponse;
import kr.trylog.experiment.ExperimentService;
import kr.trylog.overview.StoreRepository;
import kr.trylog.shared.InvalidInputException;
import kr.trylog.shared.NotFoundException;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class ReportService {
    private final ExperimentService experiments;
    private final StoreRepository store;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public ReportService(ExperimentService experiments, StoreRepository store, JdbcTemplate jdbc, Clock clock) {
        this.experiments = experiments;
        this.store = store;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public SalesReport find(String id) {
        experiments.find(id);
        throw new NotFoundException("이 시도에 저장된 보고서가 없어요. DB 주문으로 다시 비교할 수 있어요.");
    }

    public SalesReport analyze(String id, MultipartFile file, String menuCode) {
        var experiment = experiments.find(id);
        SalesComparison comparison = comparison(experiment, chooseMenu(experiment, menuCode));
        PosFileReader.read(file, comparison);
        return comparison.uploaded();
    }

    public SalesReport fromDatabase(String id, String menuCode) {
        var experiment = experiments.find(id);
        String menu = chooseMenu(experiment, menuCode);
        SalesComparison window = comparison(experiment, menu);
        Map<LocalDate, SalesComparison.Daily> daily = new HashMap<>();
        jdbc.query("""
                SELECT base_date,
                       COUNT(DISTINCT receipt_id) FILTER (WHERE is_refunded IS FALSE AND menu2_cd = ?) AS targets,
                       COUNT(DISTINCT receipt_id) FILTER (WHERE is_refunded IS FALSE) AS receipts,
                       COALESCE(SUM(price::numeric * quantity) FILTER (WHERE is_refunded IS FALSE), 0) AS sales,
                       COUNT(*) FILTER (WHERE is_refunded IS TRUE) AS refunds,
                       COUNT(*) FILTER (WHERE is_refunded IS NULL) AS unknown_refunds
                FROM seoul_youth_ai_hackathon.pos_orders
                WHERE store_id = ? AND (base_date BETWEEN ? AND ? OR base_date BETWEEN ? AND ?)
                GROUP BY base_date
                """, rs -> {
                    daily.put(rs.getObject("base_date", LocalDate.class),
                            new SalesComparison.Daily(rs.getLong("targets"), rs.getLong("receipts"),
                                    rs.getBigDecimal("sales").longValueExact(), rs.getLong("refunds"),
                                    rs.getLong("unknown_refunds")));
                }, menu, experiment.storeId(), window.beforeStart, window.endOf(window.beforeStart),
                window.afterStart, window.endOf(window.afterStart));
        return window.calculate(daily, "DATABASE");
    }

    public String sample(String id, String requestedMenu) {
        var experiment = experiments.find(id);
        List<String> codes = store.menus().stream().map(StoreRepository.Menu::menuCode).toList();
        if (codes.size() < 2) throw new InvalidInputException(Map.of("targetMenuCode", "예시 주문을 만들려면 가게 메뉴가 두 개 이상 필요해요."));
        String target = chooseMenu(experiment, requestedMenu == null && experiment.targetMenuCode() == null
                ? codes.get(0) : requestedMenu);
        String other = codes.stream().filter(code -> !code.equals(target)).findFirst().orElseThrow();
        var window = new SalesComparison(experiment.storeId(), target, experiment.startDate(), experiment.endDate());
        StringBuilder output = new StringBuilder();
        try (CSVPrinter csv = new CSVPrinter(output, CSVFormat.RFC4180)) {
            csv.printRecord("base_date", "receipt_id", "store_id", "menu2_cd", "price", "quantity", "is_refunded");
            samplePeriod(csv, window.beforeStart, window.days, experiment.storeId(), target, other, 100, 42);
            samplePeriod(csv, window.afterStart, window.days, experiment.storeId(), target, other, 160, 58);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return output.toString();
    }

    private static void samplePeriod(CSVPrinter csv, LocalDate start, int days, int storeId, String target,
                                     String other, int total, int targets) throws IOException {
        for (int i = 0; i < total; i++) {
            csv.printRecord(start.plusDays(i % days), "S" + i, storeId, i < targets ? target : other, 5000, 1, false);
        }
    }

    private String chooseMenu(ExperimentResponse experiment, String requestedMenu) {
        String menu = requestedMenu == null ? experiment.targetMenuCode() : requestedMenu.strip();
        if (menu == null || menu.isBlank() || menu.length() > 20) {
            throw new InvalidInputException(Map.of("targetMenuCode", "비교할 가게 메뉴를 선택해주세요."));
        }
        store.requireMenu(menu);
        return menu;
    }

    private SalesComparison comparison(ExperimentResponse experiment, String menu) {
        if (LocalDate.now(clock).isBefore(experiment.checkDate())) {
            throw new InvalidInputException(Map.of("checkDate", experiment.checkDate() + "부터 결과를 확인할 수 있어요."));
        }
        return new SalesComparison(experiment.storeId(), menu, experiment.startDate(), experiment.endDate());
    }
}
