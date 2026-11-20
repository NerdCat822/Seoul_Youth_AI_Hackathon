package kr.trylog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@AutoConfigureMockMvc
@Import(ApiIntegrationTest.FixedClockConfiguration.class)
class ReportIntegrationTest {
    private static final String ROOT = "/api/v1/experiments";
    private static final String HEADER = "base_date,receipt_id,store_id,menu2_cd,price,quantity,is_refunded";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;

    @Test
    void sampleCanBeDownloadedUploadedAndReopened() throws Exception {
        String path = create("2026-10-30", "2026-11-12");
        mvc.perform(get(path + "/report")).andExpect(status().isNotFound());
        byte[] file = mvc.perform(get(path + "/sample.csv")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        String saved = upload(path, "sample.csv", file, "MENU01")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.before.targetOrders").value(42))
                .andExpect(jsonPath("$.before.totalOrders").value(100))
                .andExpect(jsonPath("$.after.targetOrders").value(58))
                .andExpect(jsonPath("$.after.totalOrders").value(160))
                .andExpect(jsonPath("$.after.sharePct").value(36.25))
                .andExpect(jsonPath("$.shareDeltaPp").value(-5.75))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        upload(path, "incomplete.csv", HEADER.getBytes(StandardCharsets.UTF_8), "MENU01")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.file").isString());
        String reloaded = mvc.perform(get(path + "/report")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(mapper.readTree(reloaded)).isEqualTo(mapper.readTree(saved));
        mvc.perform(get(path)).andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void shortPeriodCountsDailyDistinctReceiptsAndFiltersIndividualRefundLines() throws Exception {
        String path = create("2026-11-06", "2026-11-07");
        String csv = "\ufeff" + HEADER + "\n"
                + "2026-10-23,A,1,X,10,1,false\n2026-10-23,A,1,X,10,2,false\n"
                + "2026-10-24,A,1,Y,10,5,false\n2026-10-24,A,1,X,10,1,true\n"
                + "2026-11-06,\"B,1\",1,X,15,3,false\n2026-11-07,C,1,X,15,1,false\n"
                + "2026-11-07,REFUND,1,X,10,7,true\n2026-11-10,OUTSIDE,1,X,10,2,true";
        upload(path, "pos.CSV", csv.getBytes(StandardCharsets.UTF_8), "X").andExpect(status().isOk())
                .andExpect(jsonPath("$.before.startDate").value("2026-10-23"))
                .andExpect(jsonPath("$.before.endDate").value("2026-10-24"))
                .andExpect(jsonPath("$.before.targetOrders").value(1))
                .andExpect(jsonPath("$.before.totalOrders").value(2))
                .andExpect(jsonPath("$.before.sales").value(80))
                .andExpect(jsonPath("$.after.sales").value(60))
                .andExpect(jsonPath("$.excludedRefundLines").value(2))
                .andExpect(jsonPath("$.shareDeltaPp").value(50));
    }

    @Test
    void excelSupportsNativeDateNumberAndBooleanCells() throws Exception {
        String path = create("2026-11-12", "2026-11-12");
        try (var workbook = new XSSFWorkbook(); var output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet();
            Row header = sheet.createRow(0);
            String[] keys = HEADER.split(",");
            for (int i = 0; i < keys.length; i++) {
                header.createCell(i).setCellValue(keys[i]);
            }
            var dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(workbook.createDataFormat().getFormat("yyyy-mm-dd"));
            for (int i = 1; i <= 2; i++) {
                Row row = sheet.createRow(i);
                var date = row.createCell(0);
                date.setCellValue(LocalDate.of(2026, 11, 12).minusDays((2 - i) * 14L));
                date.setCellStyle(dateStyle);
                row.createCell(1).setCellValue("R1");
                row.createCell(2).setCellValue(1);
                row.createCell(3).setCellValue(i == 1 ? "Y" : "X");
                row.createCell(4).setCellValue(150);
                row.createCell(5).setCellValue(1);
                row.createCell(6).setCellValue(false);
            }
            workbook.write(output);
            upload(path, "orders.xlsx", output.toByteArray(), "X").andExpect(status().isOk())
                    .andExpect(jsonPath("$.before.sharePct").value(0))
                    .andExpect(jsonPath("$.after.sharePct").value(100));
        }
    }

    @Test
    void rejectsUnknownMenuBadFilesMixedStoresAndEmptyDenominator() throws Exception {
        String path = create("2026-11-12", "2026-11-12");
        String csv = HEADER + "\n2026-10-29,A,1,X,10,1,false\n2026-11-12,B,1,X,10,1,false";
        upload(path, "orders.csv", csv.getBytes(StandardCharsets.UTF_8), "Unknown")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.targetMenuCode").isString());
        for (String bad : List.of(csv.replace("B,1", "B,2"), csv.replace("false", "true"),
                csv.replace("base_date", "date"), csv.replace("10,1", "10,0"), csv.replace("false", "maybe"),
                csv.replace("2026-10-29", "2026-11-12"), csv.replace("X,10", "\"X,10"))) {
            upload(path, "orders.csv", bad.getBytes(StandardCharsets.UTF_8), "X")
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.file").isString());
        }
        upload(path, "wrong.xlsx", csv.getBytes(StandardCharsets.UTF_8), "X")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.file").isString());
        mvc.perform(get(path)).andExpect(jsonPath("$.status").value("READY"));
        mvc.perform(get(path + "/report")).andExpect(status().isNotFound());
    }

    @Test
    void roundsPercentagePointDifferenceOnlyAfterSubtractingExactShares() throws Exception {
        String path = create("2026-11-12", "2026-11-12");
        StringBuilder csv = new StringBuilder(HEADER);
        for (int i = 0; i < 6; i++) {
            csv.append("\n2026-10-29,R").append(i).append(",1,").append(i == 0 ? "X" : "Y").append(",100,1,false");
        }
        for (int i = 0; i < 3; i++) {
            csv.append("\n2026-11-12,R").append(i).append(",1,").append(i == 0 ? "X" : "Y").append(",100,1,false");
        }
        upload(path, "orders.csv", csv.toString().getBytes(StandardCharsets.UTF_8), "X")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.before.sharePct").value(16.67))
                .andExpect(jsonPath("$.after.sharePct").value(33.33))
                .andExpect(jsonPath("$.shareDeltaPp").value(16.67));
    }

    @Test
    void blocksAnalysisUntilDayAfterEnd() throws Exception {
        String path = create("2026-11-01", "2026-11-13");
        upload(path, "orders.csv", new byte[0], "X").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.checkDate").isString());
    }

    private String create(String start, String end) throws Exception {
        String json = mapper.writeValueAsString(Map.of("title", "테스트 시도", "category", "MENU",
                "startDate", start, "endDate", end));
        return mvc.perform(post(ROOT).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andReturn().getResponse().getHeader("Location");
    }

    private ResultActions upload(String path, String name, byte[] bytes, String menuCode) throws Exception {
        var file = new MockMultipartFile("file", name, MediaType.APPLICATION_OCTET_STREAM_VALUE, bytes);
        return mvc.perform(multipart(path + "/report").file(file).param("targetMenuCode", menuCode));
    }
}
