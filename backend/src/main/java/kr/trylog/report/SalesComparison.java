package kr.trylog.report;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.trylog.shared.InvalidInputException;

/** Request-local accumulators. The repository receives only a fully verified report. */
final class SalesComparison {
    private final LocalDate start;
    private final int days;
    private final String targetMenu;
    private final Map<LocalDate, Day> daily = new HashMap<>();
    private String storeId;
    private boolean targetSeen;
    private int refundLines;

    private static final class Day {
        final Set<String> receipts = new HashSet<>();
        final Set<String> targetReceipts = new HashSet<>();
        long sales;
    }

    SalesComparison(LocalDate start, int days, String targetMenu) {
        this.start = start;
        this.days = days;
        this.targetMenu = targetMenu;
    }

    void add(int row, Map<String, String> fields) {
        LocalDate date;
        try {
            date = LocalDate.parse(fields.get("base_date"));
        } catch (DateTimeParseException e) {
            throw fileError(row + "행 base_date를 YYYY-MM-DD로 입력해주세요.");
        }
        String store = fields.get("store_id");
        positiveNumber(store, row, "store_id", 1);
        if (storeId == null) {
            storeId = store;
        } else if (!storeId.equals(store)) {
            throw fileError(row + "행에 다른 가게가 있어요. 한 가게의 자료만 올려주세요.");
        }
        String receipt = fields.get("receipt_id");
        String menu = fields.get("menu2_cd");
        if (receipt.isBlank() || receipt.length() > 32 || menu.isBlank() || menu.length() > 20) {
            throw fileError(row + "행 receipt_id(1~32자)와 menu2_cd(1~20자)를 확인해주세요.");
        }
        int price = positiveNumber(fields.get("price"), row, "price", 0);
        int quantity = positiveNumber(fields.get("quantity"), row, "quantity", 1);
        String refund = fields.get("is_refunded");
        if (!refund.equalsIgnoreCase("true") && !refund.equalsIgnoreCase("false")) {
            throw fileError(row + "행 is_refunded는 true 또는 false로 입력해주세요.");
        }
        if (!inPeriod(date, start) && !inPeriod(date, start.minusDays(14))) {
            return;
        }
        Day day = daily.computeIfAbsent(date, ignored -> new Day());
        boolean target = menu.equals(targetMenu);
        targetSeen |= target;
        if (Boolean.parseBoolean(refund)) {
            refundLines++;
            return;
        }
        day.receipts.add(receipt);
        if (target) {
            day.targetReceipts.add(receipt);
        }
        day.sales = addSales(day.sales, (long) price * quantity);
    }

    SalesReport result() {
        SalesReport.Period before = period(start.minusDays(14));
        SalesReport.Period after = period(start);
        if (!targetSeen) {
            throw new InvalidInputException(Map.of("targetMenuCode", "두 비교 기간에 이 메뉴 코드가 없어요. 파일의 menu2_cd 값을 확인해주세요."));
        }
        long difference = (long) after.targetOrders() * before.totalOrders()
                - (long) before.targetOrders() * after.totalOrders();
        BigDecimal delta = BigDecimal.valueOf(100L * difference)
                .divide(BigDecimal.valueOf((long) before.totalOrders() * after.totalOrders()), 2, RoundingMode.HALF_UP);
        String summary = "대상 메뉴가 포함된 주문은 %d건에서 %d건, 전체 주문 중 비중은 %s%%에서 %s%%로 관찰됐어요. 같은 기간의 다른 변화도 함께 살펴보세요."
                .formatted(before.targetOrders(), after.targetOrders(), before.sharePct().toPlainString(),
                        after.sharePct().toPlainString());
        return new SalesReport(targetMenu, before, after, delta, refundLines, summary);
    }

    private SalesReport.Period period(LocalDate from) {
        List<String> missing = new ArrayList<>();
        int target = 0;
        int total = 0;
        long sales = 0;
        for (int i = 0; i < days; i++) {
            LocalDate date = from.plusDays(i);
            Day day = daily.get(date);
            if (day == null) {
                missing.add(date.toString());
            } else {
                target += day.targetReceipts.size();
                total += day.receipts.size();
                sales = addSales(sales, day.sales);
            }
        }
        if (!missing.isEmpty()) {
            throw fileError("영업일 자료가 비어 있어요 (" + String.join(", ", missing) + "). 휴무와 누락을 구분할 수 없어 비교를 보류했어요.");
        }
        if (total == 0) {
            throw fileError(from + "부터 " + days + "일간 환불을 제외한 주문이 없어 비중을 계산할 수 없어요.");
        }
        BigDecimal share = BigDecimal.valueOf(100L * target)
                .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);
        return new SalesReport.Period(from, from.plusDays(days - 1L), target, total, share, sales);
    }

    private boolean inPeriod(LocalDate date, LocalDate from) {
        return !date.isBefore(from) && date.isBefore(from.plusDays(days));
    }

    private static int positiveNumber(String value, int row, String column, int min) {
        try {
            int parsed = Integer.parseInt(value);
            if (parsed >= min) {
                return parsed;
            }
        } catch (NumberFormatException ignored) {
            // Use the same field-specific message for blanks, decimals and overflow.
        }
        throw fileError(row + "행 " + column + " 값은 " + min + " 이상의 정수로 입력해주세요.");
    }

    private static long addSales(long current, long increment) {
        // All totals exposed as JSON numbers must remain exact in JavaScript.
        if (increment > 9_007_199_254_740_991L - current) {
            throw fileError("매출 합계가 처리 가능한 범위를 넘었어요. 단가와 수량을 확인해주세요.");
        }
        return current + increment;
    }

    static InvalidInputException fileError(String message) {
        return new InvalidInputException(Map.of("file", message));
    }
}
