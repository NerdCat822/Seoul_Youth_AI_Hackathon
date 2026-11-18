package kr.trylog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(ApiIntegrationTest.FixedClockConfiguration.class)
class ApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;

    @TestConfiguration
    static class FixedClockConfiguration {
        @Bean @Primary
        Clock testClock() {
            // UTC date is Nov 12, but the date in Korea is Nov 13.
            return Clock.fixed(Instant.parse("2026-11-12T16:00:00Z"), ZoneId.of("Asia/Seoul"));
        }
    }

    @Test
    void overviewUsesSeoulDateAndDisclosesDemoStorage() throws Exception {
        mvc.perform(get("/api/v1/health")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/api/v1/overview")).andExpect(status().isOk())
                .andExpect(jsonPath("$.today").value("2026-11-13"))
                .andExpect(jsonPath("$.storageMode").value("MEMORY"))
                .andExpect(jsonPath("$.demo").value(true));
    }

    @Test
    void createFindAndListPreserveInputAndDeriveCheckDate() throws Exception {
        String body = mapper.writeValueAsString(Map.of("title", "  추천 표시 붙이기  ", "category", "MENU",
                "startDate", "2026-11-13", "endDate", "2026-11-26", "notes", "추천 표시 하나만"));
        String json = mvc.perform(post("/api/v1/experiments").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.title").value("추천 표시 붙이기"))
                .andExpect(jsonPath("$.checkDate").value("2026-11-27"))
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(json).get("id").asText();
        mvc.perform(get("/api/v1/experiments/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value("추천 표시 하나만"));
        mvc.perform(get("/api/v1/experiments")).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem(id)));
    }

    @Test
    void rejectsBlankTitleMissingFieldsAndTooLongNotes() throws Exception {
        mvc.perform(post("/api/v1/experiments").contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("title", "   ", "notes", "가".repeat(501)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.title").isString())
                .andExpect(jsonPath("$.fieldErrors.category").isString())
                .andExpect(jsonPath("$.fieldErrors.startDate").isString())
                .andExpect(jsonPath("$.fieldErrors.endDate").isString())
                .andExpect(jsonPath("$.fieldErrors.notes").isString());
    }

    @Test
    void rejectsReversedAndOutOfRangeDates() throws Exception {
        mvc.perform(post("/api/v1/experiments").contentType(MediaType.APPLICATION_JSON)
                        .content(request("2026-11-26", "2026-11-13")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.endDate").isString());
        mvc.perform(post("/api/v1/experiments").contentType(MediaType.APPLICATION_JSON)
                        .content(request("1999-12-31", "2101-01-01")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.startDate").isString())
                .andExpect(jsonPath("$.fieldErrors.endDate").isString());
    }

    @Test
    void rejectsInvalidJsonEnumAndDates() throws Exception {
        for (String body : new String[]{"{", "null", request("2026-02-30", "2026-11-13"),
                request("2026-11-13", "2026-11-26").replace("MENU", "UNKNOWN"),
                request("2026-11-13", "2026-11-26").replace("\"MENU\"", "0"),
                request("2026-11-13", "2026-11-26").replace("MENU", "0")}) {
            mvc.perform(post("/api/v1/experiments").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
    }

    @Test
    void returnsReadable404ForUnknownRecord() throws Exception {
        mvc.perform(get("/api/v1/experiments/missing")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.fieldErrors").isMap());
    }

    @Test
    void preservesHttpProtocolErrorsInsteadOfReturningServerError() throws Exception {
        mvc.perform(delete("/api/v1/experiments")).andExpect(status().isMethodNotAllowed())
                .andExpect(header().exists("Allow"))
                .andExpect(jsonPath("$.code").value("REQUEST_ERROR"));
        mvc.perform(post("/api/v1/experiments").contentType(MediaType.TEXT_PLAIN).content("hello"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("REQUEST_ERROR"));
    }

    @Test
    void fictionalCasesHaveConsistentCounts() throws Exception {
        String body = mvc.perform(get("/api/v1/cases")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode cases = mapper.readTree(body);
        assertThat(cases.size()).isEqualTo(6);
        for (JsonNode item : cases) {
            assertThat(item.get("demo").asBoolean()).isTrue();
            assertThat(item.get("cost").asInt()).isNotNegative();
            assertThat(item.get("sampleSize").asInt()).isEqualTo(item.get("improved").asInt()
                    + item.get("unchanged").asInt() + item.get("declined").asInt());
        }
    }

    private String request(String start, String end) throws Exception {
        return mapper.writeValueAsString(Map.of("title", "테스트 시도", "category", "MENU",
                "startDate", start, "endDate", end));
    }
}
