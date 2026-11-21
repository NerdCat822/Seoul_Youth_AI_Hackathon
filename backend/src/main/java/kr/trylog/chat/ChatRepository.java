package kr.trylog.chat;

import com.fasterxml.jackson.annotation.JsonRawValue;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import kr.trylog.shared.NotFoundException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Reads and appends stored conversations. Tables are created by ops/chat-schema.sql. */
@Repository
public class ChatRepository {
    public record Session(String id, String title, String experimentId, String experimentTitle,
                          Instant createdAt, Instant lastMessageAt, int messageCount, String preview) { }

    /** payload is the stored JSONB text and is written to the response as JSON, not as a quoted string. */
    public record Message(long id, String role, String content, @JsonRawValue String payload, Instant createdAt) { }

    public record Conversation(Session session, List<Message> messages) { }

    /** One message to append. payload is JSON text or null. */
    public record NewMessage(String role, String content, String payload) { }

    // SYSTEM rows hold instructions for the model. They are kept for the agent, not shown to the owner.
    private static final String SESSIONS = """
            SELECT s.id, s.title, s.experiment_id, e.title AS experiment_title, s.created_at,
                   COALESCE(m.last_at, s.created_at) AS last_message_at,
                   COALESCE(m.message_count, 0) AS message_count, m.preview
            FROM seoul_youth_ai_hackathon.chat_sessions s
            LEFT JOIN seoul_youth_ai_hackathon.experiments e ON e.id = s.experiment_id AND e.store_id = s.store_id
            LEFT JOIN LATERAL (
                SELECT count(*) AS message_count, max(created_at) AS last_at,
                       (array_agg(left(content, 80) ORDER BY message_id DESC))[1] AS preview
                FROM seoul_youth_ai_hackathon.chat_messages
                WHERE session_id = s.id AND role <> 'SYSTEM'
            ) m ON true
            WHERE s.store_id = ?
            """;
    private static final RowMapper<Session> SESSION = (rs, row) -> new Session(
            rs.getString("id"), rs.getString("title"), rs.getString("experiment_id"), rs.getString("experiment_title"),
            instant(rs, "created_at"), instant(rs, "last_message_at"), rs.getInt("message_count"),
            rs.getString("preview"));
    private final JdbcTemplate jdbc;

    public ChatRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Session> sessions(int storeId) {
        return jdbc.query(SESSIONS + "ORDER BY last_message_at DESC, s.id DESC LIMIT 200", SESSION, storeId);
    }

    public Optional<Session> session(int storeId, String id) {
        return jdbc.query(SESSIONS + "AND s.id = ?", SESSION, storeId, id).stream().findFirst();
    }

    public List<Message> messages(String sessionId) {
        return jdbc.query("""
                SELECT message_id, role, content, payload::text AS payload, created_at
                FROM seoul_youth_ai_hackathon.chat_messages
                WHERE session_id = ? AND role <> 'SYSTEM'
                ORDER BY message_id LIMIT 2000
                """, (rs, row) -> new Message(rs.getLong("message_id"), rs.getString("role"),
                rs.getString("content"), rs.getString("payload"), instant(rs, "created_at")), sessionId);
    }

    /**
     * Appends one exchange. The first call for an id creates the conversation with the given title.
     * An id that belongs to another store is reported as missing.
     */
    public Session append(int storeId, String id, String title, String experimentId, List<NewMessage> messages) {
        jdbc.update("""
                INSERT INTO seoul_youth_ai_hackathon.chat_sessions (id, store_id, title) VALUES (?, ?, ?)
                ON CONFLICT (id) DO NOTHING
                """, id, storeId, title);
        Integer owner = jdbc.queryForObject(
                "SELECT store_id FROM seoul_youth_ai_hackathon.chat_sessions WHERE id = ? FOR UPDATE", Integer.class, id);
        if (owner == null || owner != storeId) {
            throw new NotFoundException("대화를 찾을 수 없어요.");
        }
        if (experimentId != null) {
            // Link only an experiment of the same store. An unknown id is ignored rather than failing the exchange.
            jdbc.update("""
                    UPDATE seoul_youth_ai_hackathon.chat_sessions SET experiment_id = ?
                    WHERE id = ? AND EXISTS (SELECT 1 FROM seoul_youth_ai_hackathon.experiments
                                             WHERE id = ? AND store_id = ?)
                    """, experimentId, id, experimentId, storeId);
        }
        for (NewMessage message : messages) {
            // clock_timestamp() keeps the order of messages written in one transaction visible in created_at.
            jdbc.update("""
                    INSERT INTO seoul_youth_ai_hackathon.chat_messages (session_id, role, content, payload, created_at)
                    VALUES (?, ?, ?, ?::jsonb, clock_timestamp())
                    """, id, message.role(), message.content(), message.payload());
        }
        return session(storeId, id).orElseThrow(() -> new NotFoundException("대화를 찾을 수 없어요."));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class).toInstant();
    }
}
