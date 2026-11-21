package kr.trylog.overview;

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

    public List<Upjong> upjongs() {
        return jdbc.query("""
                SELECT upjong_cd, upjong_nm FROM seoul_youth_ai_hackathon.upjongs
                ORDER BY display_order, upjong_cd
                """, (rs, row) -> new Upjong(rs.getString("upjong_cd"), rs.getString("upjong_nm")));
    }

    public StoreInfo storeInfo() {
        return jdbc.query("""
                SELECT s.store_id, s.store_name, u.upjong_cd,
                       CASE WHEN u.upjong_cd IS NOT NULL THEN u.upjong_nm
                            WHEN btrim(s.upjong) = '' OR btrim(s.upjong) ~* '^Q[0-9]+$' THEN '업종 미확인'
                            ELSE s.upjong END AS upjong_nm
                FROM seoul_youth_ai_hackathon.stores s
                LEFT JOIN seoul_youth_ai_hackathon.upjongs u ON u.upjong_cd = s.upjong
                WHERE s.store_id = ?
                """, (rs, row) -> new StoreInfo(rs.getInt("store_id"), rs.getString("store_name"),
                rs.getString("upjong_cd"), rs.getString("upjong_nm")), storeId()).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("설정한 가게를 찾을 수 없어요."));
    }

    public int storeId() {
        return StorePrincipal.require().storeId();
    }

    public String storeName() {
        return jdbc.queryForList("""
                SELECT store_name FROM seoul_youth_ai_hackathon.stores WHERE store_id = ?
                """, String.class, storeId()).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("설정한 가게를 찾을 수 없어요."));
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
