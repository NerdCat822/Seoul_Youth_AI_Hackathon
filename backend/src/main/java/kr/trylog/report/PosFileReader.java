package kr.trylog.report;

import static kr.trylog.report.SalesComparison.fileError;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PushbackReader;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipInputStream;
import kr.trylog.shared.InvalidInputException;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVRecord;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

final class PosFileReader {
    private static final List<String> REQUIRED = List.of("base_date", "receipt_id", "store_id", "menu2_cd",
            "price", "quantity", "is_refunded");
    private static final int MAX_ROWS = 50_000;

    static void read(MultipartFile file, SalesComparison comparison) {
        if (file != null && file.getSize() > 5L * 1024 * 1024) {
            throw new MaxUploadSizeExceededException(5L * 1024 * 1024);
        }
        if (file == null || file.isEmpty()) {
            throw fileError("5MB 이내의 주문 CSV 또는 XLSX 파일을 선택해주세요.");
        }
        String name = String.valueOf(file.getOriginalFilename()).toLowerCase(Locale.ROOT);
        try {
            if (name.endsWith(".csv")) {
                readCsv(file, comparison);
            } else if (name.endsWith(".xlsx")) {
                readExcel(file, comparison);
            } else {
                throw fileError("UTF-8 CSV 또는 시트가 하나인 XLSX 파일을 선택해주세요.");
            }
        } catch (InvalidInputException e) {
            throw e;
        } catch (IOException | UncheckedIOException e) {
            throw fileError("파일을 읽지 못했어요. 파일 형식과 CSV의 UTF-8 인코딩을 확인해주세요.");
        }
    }

    private static void readCsv(MultipartFile file, SalesComparison comparison) throws IOException {
        try (var reader = new PushbackReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8.newDecoder()))) {
            int first = reader.read();
            if (first != -1 && first != '\ufeff') {
                reader.unread(first);
            }
            try (var parser = CSVFormat.DEFAULT.parse(reader)) {
                Iterator<CSVRecord> rows = parser.iterator();
                if (!rows.hasNext()) {
                    throw fileError("첫 줄에 주문 양식의 열 이름을 넣어주세요.");
                }
                List<String> header = rows.next().toList();
                Map<String, Integer> columns = columns(header);
                while (rows.hasNext()) {
                    CSVRecord record = rows.next();
                    int row = Math.toIntExact(record.getRecordNumber());
                    checkRow(row);
                    if (record.size() != header.size()) {
                        throw fileError(row + "행의 열 개수가 첫 줄과 달라요.");
                    }
                    Map<String, String> fields = new HashMap<>();
                    columns.forEach((key, index) -> fields.put(key, record.get(index).strip()));
                    comparison.add(row, fields);
                }
            }
        }
    }

    private static void readExcel(MultipartFile file, SalesComparison comparison) throws IOException {
        checkExpandedSize(file);
        try (var stream = file.getInputStream(); var workbook = new XSSFWorkbook(stream)) {
            if (workbook.getNumberOfSheets() != 1) {
                throw fileError("주문 자료 시트 한 장만 남겨서 올려주세요.");
            }
            Sheet sheet = workbook.getSheetAt(0);
            Row header = sheet.getRow(0);
            if (header == null || header.getLastCellNum() > 128) {
                throw fileError("시트의 첫 줄에 주문 양식의 열 이름을 넣어주세요.");
            }
            List<String> names = new ArrayList<>();
            for (int index = 0; index < header.getLastCellNum(); index++) {
                names.add(cellText(header.getCell(index), ""));
            }
            Map<String, Integer> columns = columns(names);
            for (Row row : sheet) {
                int number = row.getRowNum() + 1;
                if (number == 1) {
                    continue;
                }
                checkRow(number);
                Map<String, String> fields = new HashMap<>();
                columns.forEach((key, index) -> fields.put(key, cellText(row.getCell(index), key)));
                if (fields.values().stream().anyMatch(value -> !value.isBlank())) {
                    comparison.add(number, fields);
                }
            }
        } catch (InvalidInputException e) {
            throw e;
        } catch (RuntimeException e) {
            // POI reports corrupt, encrypted and unsupported workbooks through unchecked exceptions.
            throw fileError("엑셀 파일을 열 수 없어요. 암호 없는 XLSX로 다시 저장해주세요.");
        }
    }

    private static String cellText(Cell cell, String column) {
        if (cell == null) {
            return "";
        }
        return switch (cell.getCellType()) {
            case BLANK -> "";
            case BOOLEAN -> Boolean.toString(cell.getBooleanCellValue());
            case STRING -> cell.getStringCellValue().strip();
            case NUMERIC -> column.equals("base_date") && DateUtil.isCellDateFormatted(cell)
                    ? cell.getLocalDateTimeCellValue().toLocalDate().toString()
                    : BigDecimal.valueOf(cell.getNumericCellValue()).stripTrailingZeros().toPlainString();
            default -> throw fileError((cell.getRowIndex() + 1) + "행에 수식 또는 오류 셀이 있어요. 값으로 붙여넣어 주세요.");
        };
    }

    private static Map<String, Integer> columns(List<String> names) {
        Map<String, Integer> columns = new HashMap<>();
        var seen = new HashSet<String>();
        for (int index = 0; index < names.size(); index++) {
            String key = names.get(index).strip();
            if (!seen.add(key)) {
                throw fileError("중복된 열 이름이 있어요 (" + key + ").");
            }
            if (REQUIRED.contains(key)) columns.put(key, index);
        }
        List<String> missing = REQUIRED.stream().filter(key -> !columns.containsKey(key)).toList();
        if (!missing.isEmpty()) {
            throw fileError("필수 열이 빠졌어요 (" + String.join(", ", missing) + ").");
        }
        return columns;
    }

    private static void checkRow(int number) {
        if (number > MAX_ROWS + 1) {
            throw fileError("한 번에 주문 자료를 50,000행까지 올릴 수 있어요.");
        }
    }

    private static void checkExpandedSize(MultipartFile file) throws IOException {
        // Bound the complete OOXML package before POI builds its in-memory workbook.
        try (var zip = new ZipInputStream(file.getInputStream())) {
            byte[] buffer = new byte[8192];
            long expanded = 0;
            int entries = 0;
            while (zip.getNextEntry() != null) {
                if (++entries > 256) {
                    throw fileError("엑셀 구성이 너무 복잡해요. 주문 시트만 새 파일로 저장해주세요.");
                }
                int count;
                while ((count = zip.read(buffer)) != -1) {
                    expanded += count;
                    if (expanded > 20L * 1024 * 1024) {
                        throw fileError("압축 해제한 엑셀 크기는 20MB 이내여야 해요.");
                    }
                }
            }
            if (entries == 0) {
                throw fileError("올바른 XLSX 파일을 선택해주세요.");
            }
        }
    }
}
