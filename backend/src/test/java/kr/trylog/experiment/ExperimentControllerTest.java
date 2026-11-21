package kr.trylog.experiment;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ExperimentController.class)
class ExperimentControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ExperimentService service;

    @Test
    void rejectsUnexpectedFieldsAndInvalidEnumsOrDates() throws Exception {
        String fields = """
                {"title":"시도","category":"MENU","actionType":"MENU_BADGE","startDate":"2026-11-20","endDate":"2026-11-20"}
                """.strip();
        for (String body : new String[]{fields.replace("\"MENU\"", "1"), fields.replace("\"MENU\"", "\"1\""),
                fields.replace("2026-11-20", "2026-02-30"), fields.replace("}", ",\"storeId\":2}")}) {
            mvc.perform(post("/api/v1/experiments").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
    }

    @Test
    void formValidationListsTheMissingActionAndTitle() throws Exception {
        mvc.perform(post("/api/v1/experiments").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.actionType").isString())
                .andExpect(jsonPath("$.fieldErrors.title").isString());
    }

    @Test
    void preservesHttpMethodAndMediaTypeErrors() throws Exception {
        mvc.perform(delete("/api/v1/experiments")).andExpect(status().isMethodNotAllowed())
                .andExpect(header().exists("Allow"));
        mvc.perform(post("/api/v1/experiments").contentType(MediaType.TEXT_PLAIN).content("입력"))
                .andExpect(status().isUnsupportedMediaType());
    }
}
