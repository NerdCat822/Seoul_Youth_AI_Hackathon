package kr.trylog.overview;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import kr.trylog.shared.InvalidInputException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class OverviewController {
    private final Clock clock;
    private final StoreRepository stores;
    private final JdbcTemplate jdbc;
    private final String databaseName;
    private final boolean demo;

    public OverviewController(Clock clock, StoreRepository stores, JdbcTemplate jdbc,
                              @Value("${trylog.database-name}") String databaseName,
                              @Value("${trylog.demo-date:}") String demoDate) {
        this.clock = clock;
        this.stores = stores;
        this.jdbc = jdbc;
        this.databaseName = databaseName;
        this.demo = !demoDate.isBlank();
    }

    public record Overview(int storeId, String storeName, String upjongCd, String upjongNm, LocalDate today, String storageMode,
                           boolean demo, boolean writeEnabled) { }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }

    @GetMapping("/ready")
    @Transactional(readOnly = true)
    public Map<String, String> ready() {
        boolean correctSchema = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT current_database() = ? AND current_schema() = 'seoul_youth_ai_hackathon'
                """, Boolean.class, databaseName));
        if (!correctSchema) {
            throw new DataAccessResourceFailureException("Unexpected database or schema");
        }
        // PostgreSQL checks referenced columns and SELECT privileges even when no rows are requested.
        jdbc.queryForList("""
                SELECT s.store_id, s.store_name, s.upjong, u.upjong_cd, u.upjong_nm, u.display_order, u.store_id,
                       a.login_id, a.password_hash, a.store_id, a.store_name, a.address, a.address_detail,
                       a.mega_cd, a.mega_nm, a.cty_cd, a.cty_nm, a.open_time, a.close_time, a.opened_date, a.closed_weekdays,
                       m.menu2_cd, m.menu2_nm, m.store_id, m.unit_price,
                       e.id, e.store_id, e.title, e.expm_category, e.action_type, e.target_menu2_cd,
                       e.start_date, e.end_date, e.notes, e.created_at, p.base_date, p.receipt_id,
                       p.store_id, p.menu2_cd, p.price, p.quantity, p.is_refunded,
                       d.store_id, d.sales_date, d.daily_sales, d.is_forecast, d.is_missing_or_closed,
                       f.experiment_id, f.prediction_id, f.target_date, f.model_version, f.expected_sales,
                       f.expected_lower, f.expected_upper, f.created_at
                FROM seoul_youth_ai_hackathon.stores s, seoul_youth_ai_hackathon.menus m,
                     seoul_youth_ai_hackathon.experiments e, seoul_youth_ai_hackathon.pos_orders p,
                     seoul_youth_ai_hackathon.v_daily_sales_mart d, seoul_youth_ai_hackathon.ml_predictions f,
                     seoul_youth_ai_hackathon.upjongs u, seoul_youth_ai_hackathon.store_accounts a
                WHERE false
                """);
        return Map.of("status", "READY");
    }

    @GetMapping("/overview")
    @Transactional(readOnly = true)
    public Overview overview() {
        var store = stores.storeInfo();
        return new Overview(store.storeId(), store.storeName(), store.upjongCd(), store.upjongNm(),
                LocalDate.now(clock), "POSTGRESQL", demo, stores.writeEnabled());
    }

    @GetMapping("/upjongs")
    @Transactional(readOnly = true)
    public Map<String, List<StoreRepository.Upjong>> upjongs() {
        return Map.of("upjongs", stores.upjongs());
    }

    @GetMapping("/menus")
    @Transactional(readOnly = true)
    public List<StoreRepository.Menu> menus() {
        return stores.menus();
    }

    @GetMapping("/sales/daily")
    @Transactional(readOnly = true)
    public List<StoreRepository.DailySale> dailySales(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        if (to.isBefore(from) || ChronoUnit.DAYS.between(from, to) >= 366) {
            throw new InvalidInputException(Map.of("to", "시작일부터 최대 366일 이내의 종료일을 선택해주세요."));
        }
        LocalDate today = LocalDate.now(clock);
        if (from.isAfter(today)) return List.of();
        return stores.dailySales(from, to.isAfter(today) ? today : to);
    }
}
