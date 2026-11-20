package kr.trylog.report;

import java.math.BigDecimal;
import java.time.LocalDate;

public record SalesReport(String targetMenuCode, Period before, Period after, BigDecimal shareDeltaPp,
                          int excludedRefundLines, String summary) {

    public record Period(LocalDate startDate, LocalDate endDate, int targetOrders,
                         int totalOrders, BigDecimal sharePct, long sales) { }
}
