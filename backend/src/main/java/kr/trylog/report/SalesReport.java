package kr.trylog.report;

import java.math.BigDecimal;
import java.time.LocalDate;

public record SalesReport(String source, boolean persisted, String targetMenuCode, Period before, Period after,
                          BigDecimal shareDeltaPp, long excludedRefundLines, long excludedUnknownRefundLines,
                          String summary) {

    public record Period(LocalDate startDate, LocalDate endDate, long targetOrders,
                         long totalOrders, BigDecimal sharePct, long sales) { }
}
