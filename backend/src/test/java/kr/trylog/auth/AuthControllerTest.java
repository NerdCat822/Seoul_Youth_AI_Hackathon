package kr.trylog.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import kr.trylog.overview.OverviewController;
import kr.trylog.overview.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

@WebMvcTest({AuthController.class, OverviewController.class})
@Import(SecurityConfig.class)
class AuthControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder passwords;
    @MockitoBean AccountService accounts;
    @MockitoBean StoreRepository stores;
    @MockitoBean JdbcTemplate jdbc;
    private static final String PATH = "/api/v1/auth";
    private static final String HEADER = "X-CSRF-TOKEN";

    @Test
    void signupCanReadUpjongChipsBeforeLoginWhileStoreInformationRequiresLogin() throws Exception {
        when(stores.upjongs()).thenReturn(List.of(new StoreRepository.Upjong("Q0001", "분식")));
        mvc.perform(get("/api/v1/upjongs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.upjongs[0].upjongCd").value("Q0001"))
                .andExpect(jsonPath("$.upjongs[0].upjongNm").value("분식"));
        mvc.perform(get("/api/v1/overview")).andExpect(status().isUnauthorized());
    }

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

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  \t "})
    void signupRequiresAnAddressDetail(String detail) throws Exception {
        signup(detail).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.addressDetail").value("상세 주소를 입력해주세요."));
        verify(accounts, never()).signup(any());
    }

    @Test
    void signupAcceptsAnAddressDetail() throws Exception {
        when(accounts.signup(argThat(form -> "1층".equals(form.addressDetail()))))
                .thenReturn(new StorePrincipal(17, "성수 분식"));
        signup("1층").andExpect(status().isCreated()).andExpect(jsonPath("$.storeId").value(17));
    }

    private ResultActions signup(String detail) throws Exception {
        ObjectNode form = json.createObjectNode()
                .put("loginId", "test_owner").put("password", "test-password").put("storeName", "성수 분식")
                .put("postalCode", "04782").put("address", "서울특별시 성동구 성수일로 1")
                .put("megaCd", "11").put("megaNm", "서울특별시").put("ctyCd", "11200").put("ctyNm", "성동구")
                .put("upjong", "Q0001").put("openTime", "10:00").put("closeTime", "20:00").put("openedDate", "2026-01-01");
        if (detail != null) form.put("addressDetail", detail);
        var anonymous = mvc.perform(get(PATH + "/session")).andReturn();
        return mvc.perform(post(PATH + "/signup").session((MockHttpSession) anonymous.getRequest().getSession())
                .header(HEADER, token(anonymous)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsBytes(form)));
    }

    private String token(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsByteArray()).required("csrfToken").asText();
    }
}
