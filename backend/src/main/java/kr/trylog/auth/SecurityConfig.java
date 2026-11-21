package kr.trylog.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import kr.trylog.shared.ApiExceptionHandler.ApiError;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

@Configuration
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        PasswordEncoder pbkdf2 = new Pbkdf2PasswordEncoder("", 16, 600_000,
                Pbkdf2PasswordEncoder.SecretKeyFactoryAlgorithm.PBKDF2WithHmacSHA256);
        return new DelegatingPasswordEncoder("pbkdf2-sha256", Map.of("pbkdf2-sha256", pbkdf2));
    }

    @Bean
    AuthenticationManager authenticationManager(AccountService accounts) {
        return token -> accounts.authenticate(token.getName(), (String) token.getCredentials()).authentication();
    }

    @Bean
    HttpSessionSecurityContextRepository sessions() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    HttpSessionCsrfTokenRepository csrfTokens() {
        return new HttpSessionCsrfTokenRepository();
    }

    @Bean
    SecurityFilterChain httpSecurity(HttpSecurity http, HttpSessionSecurityContextRepository sessions,
            HttpSessionCsrfTokenRepository tokens, ObjectMapper mapper) throws Exception {
        return http
                .authorizeHttpRequests(routes -> routes
                        .requestMatchers("/api/v1/auth/**", "/api/v1/health", "/api/v1/ready").permitAll()
                        .anyRequest().authenticated())
                .securityContext(config -> config.securityContextRepository(sessions))
                .csrf(config -> config.csrfTokenRepository(tokens)
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .exceptionHandling(config -> config
                        .authenticationEntryPoint((request, response, cause) ->
                                send(mapper, response, 401, "UNAUTHENTICATED", "로그인이 필요해요."))
                        .accessDeniedHandler((request, response, cause) -> {
                            if (cause instanceof CsrfException) {
                                send(mapper, response, 403, "CSRF_INVALID", "세션이 변경됐어요. 다시 시도해주세요.");
                            } else {
                                send(mapper, response, 403, "FORBIDDEN", "이 요청을 실행할 권한이 없어요.");
                            }
                        }))
                .requestCache(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .build();
    }

    private static void send(ObjectMapper mapper, HttpServletResponse response, int status,
                             String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), new ApiError(code, message, Map.of()));
    }
}
