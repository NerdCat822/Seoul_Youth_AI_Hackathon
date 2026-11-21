package kr.trylog.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import kr.trylog.shared.ApiExceptionHandler.ApiError;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    public record SessionView(boolean authenticated, Integer storeId, String storeName, String loginId,
                              boolean signupEnabled, String csrfToken) {}
    public record LoginRequest(
            @NotBlank(message = "아이디를 입력해주세요.") @Size(max = 40, message = "아이디는 40자 이내로 입력해주세요.") String loginId,
            @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
            @NotBlank(message = "비밀번호를 입력해주세요.") @Size(max = 128, message = "비밀번호는 128자 이내로 입력해주세요.") String password) {}

    private final AccountService accounts;
    private final AuthenticationManager authenticator;
    private final HttpSessionSecurityContextRepository sessions;
    private final HttpSessionCsrfTokenRepository tokens;

    public AuthController(AccountService accounts, AuthenticationManager authenticator,
                          HttpSessionSecurityContextRepository sessions, HttpSessionCsrfTokenRepository tokens) {
        this.accounts = accounts;
        this.authenticator = authenticator;
        this.sessions = sessions;
        this.tokens = tokens;
    }

    @GetMapping("/session")
    public SessionView session(HttpServletRequest request, HttpServletResponse response) {
        StorePrincipal store = StorePrincipal.current();
        return new SessionView(store != null, store == null ? null : store.storeId(),
                store == null ? null : store.storeName(), store == null ? null : store.loginId(), accounts.signupEnabled(),
                tokens.loadDeferredToken(request, response).get().getToken());
    }

    @PostMapping("/login")
    public SessionView login(@Valid @RequestBody LoginRequest form,
                             HttpServletRequest request, HttpServletResponse response) {
        Authentication login = authenticator.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(form.loginId(), form.password()));
        return signedIn(login, request, response);
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public SessionView signup(@Valid @RequestBody SignupRequest form,
                              HttpServletRequest request, HttpServletResponse response) {
        return signedIn(accounts.signup(form).authentication(), request, response);
    }

    private SessionView signedIn(Authentication authenticated, HttpServletRequest request, HttpServletResponse response) {
        request.getSession();
        request.changeSessionId();
        tokens.saveToken(null, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authenticated);
        SecurityContextHolder.setContext(context);
        sessions.saveContext(context, request, response);
        return session(request, response);
    }

    @PostMapping("/logout")
    public SessionView logout(HttpServletRequest request, HttpServletResponse response) {
        SecurityContextHolder.clearContext();
        HttpSession previous = request.getSession(false);
        if (previous != null) previous.invalidate();
        // The new anonymous session receives its own token for the next login.
        return session(request, response);
    }

    @ExceptionHandler(BadCredentialsException.class)
    ResponseEntity<ApiError> rejectedLogin(BadCredentialsException error) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ApiError("INVALID_CREDENTIALS", "아이디와 비밀번호를 확인해주세요.", Map.of()));
    }

    @ExceptionHandler(DuplicateLoginException.class)
    ResponseEntity<ApiError> duplicateLogin() {
        String message = "이미 사용 중인 로그인 아이디예요.";
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiError("LOGIN_ID_TAKEN", message, Map.of("loginId", message)));
    }
}
