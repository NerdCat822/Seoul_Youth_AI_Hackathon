package kr.trylog.report;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.trylog.shared.InvalidInputException;

/** Both input paths reduce each trading date to the same receipt and sales totals. */
final class SalesComparison {
    record Daily(long targets, long receipts, long sales, long refunds, long unknownRefunds) {}

    private static final class FileDay {
        final Set<String> receipts = new HashSet<>();
        final Set<String> targets = new HashSet<>();
        long sales;
        long refunds;
    }

    final LocalDate beforeStart;
    final LocalDate afterStart;
    final int days;
    private final int storeId;
    private final String menu;
    private final Map<LocalDate, FileDay> fileDays = new HashMap<>();

    SalesComparison(int storeId, String menu, LocalDate start, LocalDate end) {
        this.storeId = storeId;
        this.menu = menu;
        beforeStart = start.minusDays(14);
        afterStart = start;
        days = (int) Math.min(14, ChronoUnit.DAYS.between(start, end) + 1);
        if (days < 1) throw new InvalidInputException(Map.of("endDate", "시도의 시작일과 종료일을 확인해주세요."));
    }

    LocalDate endOf(LocalDate start) {
        return start.plusDays(days - 1);
    }

    void add(int row, Map<String, String> fields) {
        LocalDate date;
        try {
            date = LocalDate.parse(fields.get("base_date"));
        } catch (DateTimeParseException e) {
            throw fileError(row + "행 base_date를 YYYY-MM-DD로 입력해주세요.");
        }
        if (number(fields, row, "store_id", 1) != storeId) {
            throw fileError(row + "행의 가게 번호가 현재 가게와 달라요.");
        }
        String receipt = fields.get("receipt_id");
        String code = fields.get("menu2_cd");
        if (receipt.isBlank() || receipt.length() > 32 || code.isBlank() || code.length() > 20) {
            throw fileError(row + "행 receipt_id(1~32자)와 menu2_cd(1~20자)를 확인해주세요.");
        }
        int price = number(fields, row, "price", 0);
        int quantity = number(fields, row, "quantity", 1);
        String refund = fields.get("is_refunded");
        if (!"false".equalsIgnoreCase(refund) && !"true".equalsIgnoreCase(refund)) {
            throw fileError(row + "행 is_refunded는 true 또는 false로 입력해주세요.");
        }
        if (!inPeriod(date, beforeStart) && !inPeriod(date, afterStart)) return;
        FileDay day = fileDays.computeIfAbsent(date, ignored -> new FileDay());
        if (Boolean.parseBoolean(refund)) {
            day.refunds++;
            return;
        }
        day.receipts.add(receipt);
        if (menu.equals(code)) day.targets.add(receipt);
        day.sales = addSales(day.sales, (long) price * quantity, "file");
    }

    SalesReport uploaded() {
        Map<LocalDate, Daily> daily = new HashMap<>();
        fileDays.forEach((date, day) -> daily.put(date, new Daily(day.targets.size(), day.receipts.size(),
                day.sales, day.refunds, 0)));
        return calculate(daily, "UPLOAD");
    }

    SalesReport calculate(Map<LocalDate, Daily> daily, String source) {
        String field = source.equals("UPLOAD") ? "file" : "orders";
        List<String> missing = new ArrayList<>();
        for (LocalDate from : List.of(beforeStart, afterStart)) {
            for (int i = 0; i < days; i++) {
                LocalDate date = from.plusDays(i);
                if (!daily.containsKey(date)) missing.add(date.toString());
            }
        }
        if (!missing.isEmpty()) {
            throw new InvalidInputException(Map.of(field, "영업일 자료가 비어 있어요 (" + String.join(", ", missing)
                    + "). 휴무와 누락을 구분할 수 없어 비교를 보류했어요."));
        }
        var before = period(daily, beforeStart, field);
        var after = period(daily, afterStart, field);
        BigDecimal beforeTotal = BigDecimal.valueOf(before.totalOrders());
        BigDecimal afterTotal = BigDecimal.valueOf(after.totalOrders());
        BigDecimal difference = BigDecimal.valueOf(after.targetOrders()).multiply(beforeTotal)
                .subtract(BigDecimal.valueOf(before.targetOrders()).multiply(afterTotal));
        BigDecimal delta = percent(difference, beforeTotal.multiply(afterTotal));
        String summary = "대상 메뉴가 포함된 주문은 %d건에서 %d건, 전체 주문 중 비중은 %s%%에서 %s%%로 관찰됐어요. 같은 기간의 다른 변화도 함께 살펴보세요."
                .formatted(before.targetOrders(), after.targetOrders(), before.sharePct(), after.sharePct());
        return new SalesReport(source, false, menu, before, after, delta,
                daily.values().stream().mapToLong(Daily::refunds).sum(),
                daily.values().stream().mapToLong(Daily::unknownRefunds).sum(), summary);
    }

    private SalesReport.Period period(Map<LocalDate, Daily> daily, LocalDate from, String field) {
        long targets = 0, receipts = 0, sales = 0;
        for (int i = 0; i < days; i++) {
            Daily day = daily.get(from.plusDays(i));
            targets += day.targets();
            receipts += day.receipts();
            sales = addSales(sales, day.sales(), field);
        }
        if (receipts == 0) {
            throw new InvalidInputException(Map.of(field, from + "부터 " + days + "일간 유효한 주문이 없어 비중을 계산할 수 없어요."));
        }
        return new SalesReport.Period(from, endOf(from), targets, receipts,
                percent(BigDecimal.valueOf(targets), BigDecimal.valueOf(receipts)), sales);
    }

    private static BigDecimal percent(BigDecimal value, BigDecimal denominator) {
        return value.movePointRight(2).divide(denominator, 2, RoundingMode.HALF_UP);
    }

    private static long addSales(long current, long increment, String field) {
        if (increment < 0 || increment > 9_007_199_254_740_991L - current) {
            throw new InvalidInputException(Map.of(field, "매출 합계를 처리할 수 없어요. 단가와 수량을 확인해주세요."));
        }
        return current + increment;
    }

    private boolean inPeriod(LocalDate date, LocalDate start) {
        return !date.isBefore(start) && !date.isAfter(endOf(start));
    }

    private static int number(Map<String, String> fields, int row, String column, int minimum) {
        try {
            int parsed = Integer.parseInt(fields.get(column));
            if (parsed >= minimum) return parsed;
        } catch (NumberFormatException ignored) { }
        throw fileError(row + "행 " + column + " 값은 " + minimum + " 이상의 정수로 입력해주세요.");
    }

    static InvalidInputException fileError(String message) {
        return new InvalidInputException(Map.of("file", message));
    }
}
