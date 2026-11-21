package kr.trylog.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;
import kr.trylog.shared.InvalidInputException;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class SalesComparisonTest {
    private static final String HEADER = "base_date,receipt_id,store_id,menu2_cd,price,quantity,is_refunded";
    private static final LocalDate START = LocalDate.of(2026, 11, 7);

    @Test
    void countsEachReceiptOncePerDayAndRoundsAfterSubtracting() {
        var window = new SalesComparison(2, "X", START, START);
        var data = new StringBuilder(HEADER);
        for (int i = 0; i < 6; i++) {
            data.append("\n2026-10-24,R").append(i).append(",2,").append(i == 0 ? "X" : "Y").append(",100,1,false");
        }
        data.append("\n2026-10-24,R0,2,X,200,2,false");
        for (int i = 0; i < 3; i++) {
            data.append("\n2026-11-07,R").append(i).append(",2,").append(i == 0 ? "X" : "Y").append(",100,1,false");
        }
        data.append("\n2026-11-07,R2,2,X,100,1,true");
        PosFileReader.read(csv(data.toString()), window);
        var report = window.uploaded();
        assertThat(report.shareDeltaPp()).isEqualByComparingTo("16.67");
        assertThat(report.before().sales()).isEqualTo(1000);
        assertThat(report.after().sales()).isEqualTo(300);
        assertThat(report.excludedRefundLines()).isEqualTo(1);
        assertThat(report.persisted()).isFalse();
        var fromDatabase = window.calculate(Map.of(START.minusDays(14), new SalesComparison.Daily(1, 6, 1000, 0, 0),
                START, new SalesComparison.Daily(1, 3, 300, 1, 1)), "DATABASE");
        assertThat(fromDatabase.before()).isEqualTo(report.before());
        assertThat(fromDatabase.after()).isEqualTo(report.after());
        assertThat(fromDatabase.excludedUnknownRefundLines()).isOne();
    }

    @Test
    void distinguishesZeroTargetSalesFromMissingDaysOrForeignStore() {
        var window = new SalesComparison(2, "X", START, START);
        String rows = HEADER + "\n2026-10-24,R,2,Y,2,1,false\n2026-11-07,R,2,Y,2,1,false";
        PosFileReader.read(csv(rows), window);
        assertThat(window.uploaded().after().sharePct()).isZero();
        assertThatThrownBy(() -> PosFileReader.read(csv(rows.replace(",2,Y", ",1,Y")), window))
                .isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> window.calculate(Map.of(), "DATABASE"))
                .isInstanceOfSatisfying(InvalidInputException.class, e ->
                        assertThat(e.fieldErrors().get("orders")).contains("2026-10-24", "2026-11-07"));
    }

    @Test
    void readsNativeDateBooleanAndNumericCellsFromASingleSheet() throws Exception {
        var window = new SalesComparison(2, "X", START, START);
        try (var workbook = new XSSFWorkbook(); var bytes = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet();
            var header = sheet.createRow(0);
            var columns = HEADER.split(",");
            for (int i = 0; i < columns.length; i++) header.createCell(i).setCellValue(columns[i]);
            var style = workbook.createCellStyle();
            style.setDataFormat(workbook.createDataFormat().getFormat("yyyy-mm-dd"));
            for (int i = 1; i <= 2; i++) {
                var row = sheet.createRow(i);
                var date = row.createCell(0);
                date.setCellStyle(style);
                date.setCellValue(i == 1 ? START.minusDays(14) : START);
                row.createCell(1).setCellValue("A");
                row.createCell(2).setCellValue(2);
                row.createCell(3).setCellValue(i == 1 ? "Y" : "X");
                row.createCell(4).setCellValue(1200);
                row.createCell(5).setCellValue(2);
                row.createCell(6).setCellValue(false);
            }
            workbook.write(bytes);
            PosFileReader.read(new MockMultipartFile("file", "pos.xlsx", null, bytes.toByteArray()), window);
        }
        assertThat(window.uploaded().shareDeltaPp()).isEqualByComparingTo("100");
        assertThat(window.uploaded().after().sales()).isEqualTo(2400);
    }

    private MockMultipartFile csv(String data) {
        return new MockMultipartFile("file", "orders.csv", "text/csv", data.getBytes(StandardCharsets.UTF_8));
    }
}
