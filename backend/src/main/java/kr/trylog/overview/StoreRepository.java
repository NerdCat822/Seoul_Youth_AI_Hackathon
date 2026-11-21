package kr.trylog.overview;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import kr.trylog.auth.StorePrincipal;
import kr.trylog.shared.InvalidInputException;
import kr.trylog.shared.NotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StoreRepository {
    private final JdbcTemplate jdbc;
    private final boolean allowWrites;

    public StoreRepository(JdbcTemplate jdbc, @Value("${trylog.allow-writes}") boolean allowWrites) {
        this.jdbc = jdbc;
        this.allowWrites = allowWrites;
    }

    public record Menu(String menuCode, String menuName, int unitPrice) { }
    public record Upjong(String upjongCd, String upjongNm) { }
    public record StoreInfo(int storeId, String storeName, String upjongCd, String upjongNm) { }
    public record DailySale(LocalDate date, long actual) { }

    public List<Upjong> upjongs() {
        return jdbc.query("""
                SELECT upjong_cd, upjong_nm FROM seoul_youth_ai_hackathon.upjongs
                ORDER BY display_order, upjong_cd
                """, (rs, row) -> new Upjong(rs.getString("upjong_cd"), rs.getString("upjong_nm")));
    }

    public StoreInfo storeInfo() {
        var account = StorePrincipal.require();
        return jdbc.query("""
                SELECT upjong_cd, upjong_nm FROM seoul_youth_ai_hackathon.upjongs WHERE store_id = ?
                """, (rs, row) -> new StoreInfo(account.storeId(), account.storeName(),
                rs.getString("upjong_cd"), rs.getString("upjong_nm")), account.storeId()).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("설정한 가게를 찾을 수 없어요."));
    }

    public int storeId() {
        return StorePrincipal.require().storeId();
    }

    public List<DailySale> dailySales(LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT base_date, COALESCE(SUM(price::numeric * quantity) FILTER (WHERE is_refunded IS FALSE), 0) AS actual
                FROM seoul_youth_ai_hackathon.pos_orders
                WHERE store_id = ? AND base_date BETWEEN ? AND ? AND is_refunded IS NOT NULL
                GROUP BY base_date
                ORDER BY base_date
                """, (rs, row) -> new DailySale(rs.getObject("base_date", LocalDate.class),
                rs.getBigDecimal("actual").longValueExact()), storeId(), from, to);
    }

    public String storeName() {
        return storeInfo().storeName();
    }

    public List<Menu> menus() {
        storeName();
        return jdbc.query("""
                SELECT menu2_cd, menu2_nm, unit_price FROM seoul_youth_ai_hackathon.menus
                WHERE store_id = ? ORDER BY menu2_nm, menu2_cd
                """, (rs, row) -> new Menu(rs.getString(1), rs.getString(2), rs.getInt(3)), storeId());
    }

    public void requireMenu(String menuCode) {
        boolean exists = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM seoul_youth_ai_hackathon.menus WHERE store_id = ? AND menu2_cd = ?)
                """, Boolean.class, storeId(), menuCode));
        if (!exists) {
            throw new InvalidInputException(Map.of("targetMenuCode", "현재 가게의 메뉴를 선택해주세요."));
        }
    }

    public boolean writeEnabled() {
        return allowWrites && Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT has_table_privilege(current_user, 'seoul_youth_ai_hackathon.experiments', 'INSERT')
                   AND NOT pg_is_in_recovery() AND NOT current_setting('default_transaction_read_only')::boolean
                """, Boolean.class));
    }
}
