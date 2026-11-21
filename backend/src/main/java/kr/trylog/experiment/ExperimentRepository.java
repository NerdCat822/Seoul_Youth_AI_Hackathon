package kr.trylog.experiment;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

@Repository
class ExperimentRepository {
    private static final String COLUMNS = """
            id, store_id, title, expm_category, action_type, target_menu2_cd, start_date, end_date, notes
            """;
    private static final String SELECT = "SELECT " + COLUMNS + " FROM seoul_youth_ai_hackathon.experiments ";
    private static final RowMapper<Experiment> MAPPER = (rs, row) -> new Experiment(
            rs.getString("id"), rs.getInt("store_id"), rs.getString("title"), rs.getString("expm_category"),
            rs.getString("action_type"), rs.getString("target_menu2_cd"), rs.getObject("start_date", LocalDate.class),
            rs.getObject("end_date", LocalDate.class), rs.getString("notes") == null ? "" : rs.getString("notes"));
    private final JdbcTemplate jdbc;

    ExperimentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<Experiment> findAll(int storeId) {
        return jdbc.query(SELECT + "WHERE store_id = ? ORDER BY created_at DESC NULLS LAST, id DESC", MAPPER, storeId);
    }

    Optional<Experiment> findById(int storeId, String id) {
        return jdbc.query(SELECT + "WHERE store_id = ? AND id = ?", MAPPER, storeId, id).stream().findFirst();
    }

    Experiment insert(Experiment record) {
        var inserted = jdbc.query("INSERT INTO seoul_youth_ai_hackathon.experiments (" + COLUMNS +
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING RETURNING " + COLUMNS,
                MAPPER, record.id(), record.storeId(), record.title(), record.category(), record.actionType(),
                record.targetMenuCode(), record.startDate(), record.endDate(), record.notes());
        if (!inserted.isEmpty()) {
            return inserted.get(0);
        }
        // A concurrent insert using the same key can commit during the preceding statement.
        return findById(record.storeId(), record.id()).filter(record::equals)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "이미 다른 내용으로 저장한 요청이에요."));
    }
}
