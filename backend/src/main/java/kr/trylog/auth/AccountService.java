package kr.trylog.auth;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import kr.trylog.shared.InvalidInputException;
import kr.trylog.shared.ReadOnlyException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class AccountService {
    private record Account(StorePrincipal store, String passwordHash) {}

    private final JdbcTemplate db;
    private final PasswordEncoder passwords;
    private final boolean allowWrites;
    private final String dummyHash;

    AccountService(JdbcTemplate db, PasswordEncoder passwords, @Value("${trylog.allow-writes}") boolean allowWrites) {
        this.db = db;
        this.passwords = passwords;
        this.allowWrites = allowWrites;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional(readOnly = true)
    public StorePrincipal authenticate(String loginId, String password) {
        var account = db.query("""
                SELECT store_id, store_name, password_hash FROM seoul_youth_ai_hackathon.stores
                WHERE login_id = ? AND password_hash IS NOT NULL
                """, (rs, row) -> new Account(new StorePrincipal(rs.getInt(1), rs.getString(2)), rs.getString(3)),
                normalize(loginId)).stream().findFirst();
        boolean matches = passwords.matches(password, account.map(Account::passwordHash).orElse(dummyHash));
        if (account.isEmpty() || !matches) throw new BadCredentialsException("아이디와 비밀번호를 확인해주세요.");
        return account.get().store();
    }

    public boolean signupEnabled() {
        return allowWrites && Boolean.TRUE.equals(db.queryForObject("""
                SELECT has_table_privilege(current_user, 'seoul_youth_ai_hackathon.stores', 'INSERT')
                   AND has_sequence_privilege(current_user,
                       pg_get_serial_sequence('seoul_youth_ai_hackathon.stores', 'store_id'), 'USAGE')
                   AND NOT pg_is_in_recovery() AND NOT current_setting('default_transaction_read_only')::boolean
                """, Boolean.class));
    }

    @Transactional
    public StorePrincipal signup(SignupRequest form) {
        if (!signupEnabled()) throw new ReadOnlyException();
        if (!form.ctyCd().startsWith(form.megaCd())) {
            throw new InvalidInputException(Map.of("ctyCd", "시도와 시군구 코드가 일치하는 주소를 선택해주세요."));
        }
        List<Integer> days = form.closedWeekdays() == null ? List.of() : form.closedWeekdays();
        String closed = days.stream().distinct().sorted().map(String::valueOf).collect(Collectors.joining(","));
        var inserted = db.query("""
                INSERT INTO seoul_youth_ai_hackathon.stores
                    (login_id, password_hash, store_name, postal_code, address, address_detail, mega_cd, mega_nm,
                     cty_cd, cty_nm, upjong, open_time, close_time, opened_date, closed_weekdays)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (login_id) DO NOTHING RETURNING store_id, store_name
                """, (rs, row) -> new StorePrincipal(rs.getInt(1), rs.getString(2)),
                normalize(form.loginId()), passwords.encode(form.password()), form.storeName().strip(),
                form.postalCode(), form.address().strip(), form.addressDetail() == null ? "" : form.addressDetail().strip(),
                form.megaCd(), form.megaNm().strip(), form.ctyCd(), form.ctyNm().strip(), form.upjong().strip(),
                form.openTime(), form.closeTime(), form.openedDate(), closed);
        if (inserted.isEmpty()) throw new DuplicateLoginException();
        return inserted.get(0);
    }

    private static String normalize(String loginId) {
        return loginId.strip().toLowerCase(Locale.ROOT);
    }
}
