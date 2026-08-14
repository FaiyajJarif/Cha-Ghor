package com.chaghor.chaghor.report.dto;

import java.math.BigDecimal;

// The estate-wide KPI rollup for a report period. Money is in BDT; profitMargin
// and attendanceRate are percentages (one decimal). periodStart / periodEnd are
// ISO date strings echoed back for the UI's period label.
public record ReportSummaryResponse(
        BigDecimal revenue,
        BigDecimal expense,
        BigDecimal netProfit,
        BigDecimal payrollCost,
        double profitMargin,
        double attendanceRate,
        long activeWorkers,
        BigDecimal loanOutstanding,
        BigDecimal loanRecovered,
        String periodStart,
        String periodEnd) {
}
