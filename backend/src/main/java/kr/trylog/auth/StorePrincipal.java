package kr.trylog.auth;

import java.io.Serializable;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

public record StorePrincipal(int storeId, String storeName) implements Serializable {
    public static StorePrincipal require() {
        StorePrincipal store = current();
        if (store == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요해요.");
        return store;
    }

    static StorePrincipal current() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof StorePrincipal store ? store : null;
    }

    Authentication authentication() {
        return UsernamePasswordAuthenticationToken.authenticated(this, null,
                List.of(new SimpleGrantedAuthority("ROLE_STORE")));
    }
}
