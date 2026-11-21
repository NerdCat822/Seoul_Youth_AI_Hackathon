package kr.trylog.forecast;

import java.time.LocalDate;
import java.util.List;
import java.util.NavigableMap;
import java.util.TreeMap;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ForecastRepository {
    record StoredDay(String model, SalesForecast.Day day) {}
    record Period(LocalDate start, LocalDate end) {}

    private final JdbcTemplate jdbc;

    public ForecastRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    NavigableMap<LocalDate, Long> history(int store, LocalDate first, LocalDate last) {
        var history = new TreeMap<LocalDate, Long>();
        jdbc.query("""
                SELECT sales_date, daily_sales
                FROM seoul_youth_ai_hackathon.v_daily_sales_mart
                WHERE store_id = ?
                  AND sales_date BETWEEN COALESCE(CAST(? AS date), '-infinity'::date) AND ?
                  AND is_forecast IS FALSE AND is_missing_or_closed IS FALSE AND daily_sales >= 0
                ORDER BY sales_date
                """, rs -> {
                    history.put(rs.getObject("sales_date", LocalDate.class), rs.getLong("daily_sales"));
                }, store, first, last);
        return history;
    }

    List<ForecastController.WeatherDay> weather(LocalDate first, LocalDate last, LocalDate today) {
        return jdbc.query("""
                SELECT feature_date, avg_temp, precipitation, is_forecast
                FROM seoul_youth_ai_hackathon.external_daily_features
                WHERE feature_date BETWEEN ? AND ?
                  AND ((feature_date <= ? AND is_forecast IS FALSE)
                    OR (feature_date >= ? AND is_forecast IS TRUE))
                ORDER BY feature_date
                """, (rs, row) -> new ForecastController.WeatherDay(
                rs.getObject("feature_date", LocalDate.class), rs.getObject("avg_temp", Double.class),
                rs.getObject("precipitation", Double.class), rs.getBoolean("is_forecast")), first, last, today, today);
    }

    List<StoredDay> predictions(int store, LocalDate through) {
        // CURRENT_TIMESTAMP in the supplied DDL is stable within one insertion transaction.
        // Never join partial runs, even for the same experiment and model version.
        return jdbc.query("""
                WITH ranked AS (
                    SELECT p.*, row_number() OVER (
                        PARTITION BY p.experiment_id, p.model_version, p.created_at, p.target_date
                        ORDER BY p.prediction_id DESC
                    ) AS rn
                    FROM seoul_youth_ai_hackathon.ml_predictions p
                    JOIN seoul_youth_ai_hackathon.experiments e ON e.id = p.experiment_id
                    WHERE e.store_id = ? AND p.target_date BETWEEN ? AND ?
                      AND p.created_at IS NOT NULL AND trim(p.model_version) <> ''
                ), complete_run AS (
                    SELECT experiment_id, model_version, created_at FROM ranked
                    WHERE rn = 1
                    GROUP BY experiment_id, model_version, created_at
                    HAVING count(*) = 7
                       AND bool_and(expected_sales >= 0 AND expected_lower BETWEEN 0 AND expected_sales
                                    AND expected_upper >= expected_sales)
                    ORDER BY created_at DESC, max(prediction_id) DESC LIMIT 1
                )
                SELECT target_date, expected_sales, expected_lower, expected_upper, model_version
                FROM ranked JOIN complete_run USING (experiment_id, model_version, created_at)
                WHERE rn = 1 ORDER BY target_date
                """, (rs, index) -> new StoredDay(rs.getString("model_version"), new SalesForecast.Day(
                rs.getObject("target_date", LocalDate.class), rs.getLong("expected_sales"),
                rs.getLong("expected_lower"), rs.getLong("expected_upper"))),
                store, through.plusDays(1), through.plusDays(7));
    }

    List<Period> lastExperiment(int store, LocalDate through) {
        return jdbc.query("""
                SELECT start_date, end_date FROM seoul_youth_ai_hackathon.experiments
                WHERE store_id = ? AND end_date <= ? AND start_date <= end_date
                ORDER BY end_date DESC, start_date DESC, id DESC LIMIT 1
                """, (rs, index) -> new Period(rs.getObject("start_date", LocalDate.class),
                rs.getObject("end_date", LocalDate.class)), store, through);
    }
}
