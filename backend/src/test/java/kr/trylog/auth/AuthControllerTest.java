package kr.trylog.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@WebMvcTest(AuthController.class)
@Import(SecurityConfig.class)
class AuthControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder passwords;
    @MockitoBean AccountService accounts;
    private static final String PATH = "/api/v1/auth";
    private static final String HEADER = "X-CSRF-TOKEN";

    @Test
    void storeApiRequiresAuthenticationAndLoginRequiresAnAnonymousSessionToken() throws Exception {
        mvc.perform(get("/api/v1/experiments")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mvc.perform(post(PATH + "/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        verifyNoInteractions(accounts);
    }

    @Test
    void successfulLoginRotatesSessionAndTokenAndLogoutInvalidatesTheStoreSession() throws Exception {
        when(accounts.authenticate("owner", "demo-pass")).thenReturn(new StorePrincipal(2, "두 번째 가게"));
        var anonymous = mvc.perform(get(PATH + "/session")).andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(false)).andReturn();
        MockHttpSession session = (MockHttpSession) anonymous.getRequest().getSession();
        String initialId = session.getId();
        var success = mvc.perform(post(PATH + "/login").session(session).header(HEADER, token(anonymous))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("loginId", "owner", "password", "demo-pass"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.storeId").value(2)).andReturn();
        assertThat(session.getId()).isNotEqualTo(initialId);
        assertThat(token(success)).isNotEqualTo(token(anonymous));
        mvc.perform(get(PATH + "/session").session(session)).andExpect(jsonPath("$.storeId").value(2));
        mvc.perform(post(PATH + "/logout").session(session).header(HEADER, token(anonymous)))
                .andExpect(status().isForbidden());
        var logout = mvc.perform(post(PATH + "/logout").session(session).header(HEADER, token(success)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(false)).andReturn();
        assertThat(session.isInvalid()).isTrue();
        assertThat(token(logout)).isNotEqualTo(token(success));
    }

    @Test
    void invalidLoginReturnsGenericErrorWithoutEchoingCredentials() throws Exception {
        when(accounts.authenticate(anyString(), anyString())).thenThrow(new BadCredentialsException("rejected"));
        var bootstrap = mvc.perform(get(PATH + "/session")).andReturn();
        var invalid = mvc.perform(post(PATH + "/login").session((MockHttpSession) bootstrap.getRequest().getSession())
                        .header(HEADER, token(bootstrap)).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("loginId", "unknown", "password", "wrong-password"))))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS")).andReturn();
        assertThat(invalid.getResponse().getContentAsString()).doesNotContain("unknown", "wrong-password");
    }

    @Test
    void passwordHashesAreSaltedAndVerifyTheEntireUtf8Password() {
        String prefix = "가".repeat(30);
        String hash = passwords.encode(prefix + "가");
        assertThat(hash).isNotEqualTo(passwords.encode(prefix + "가"));
        assertThat(passwords.matches(prefix + "가", hash)).isTrue();
        assertThat(passwords.matches(prefix + "나", hash)).isFalse();
    }

    private String token(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsByteArray()).required("csrfToken").asText();
    }
}
