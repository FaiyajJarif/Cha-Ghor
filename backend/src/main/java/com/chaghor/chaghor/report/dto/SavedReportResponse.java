package com.chaghor.chaghor.report.dto;

import com.chaghor.chaghor.report.SavedReport;

import java.math.BigDecimal;

// A saved report row for the \"Generated Reports\" table. Dates / timestamps are
// serialized as ISO strings so the frontend can render them directly.
public record SavedReportResponse(
        Long id,
        String title,
        String reportType,
        String periodStart,
        String periodEnd,
        String status,
        String summary,
        BigDecimal revenue,
        BigDecimal expense,
        BigDecimal netProfit,
        String generatedAt,
        String finalizedAt) {

    public static SavedReportResponse from(SavedReport r) {
        return new SavedReportResponse(
                r.getId(),
                r.getTitle(),
                r.getReportType(),
                r.getPeriodStart() == null ? null : r.getPeriodStart().toString(),
                r.getPeriodEnd() == null ? null : r.getPeriodEnd().toString(),
                r.getStatus() == null ? null : r.getStatus().name(),
                r.getSummary(),
                r.getRevenue(),
                r.getExpense(),
                r.getNetProfit(),
                r.getGeneratedAt() == null ? null : r.getGeneratedAt().toString(),
                r.getFinalizedAt() == null ? null : r.getFinalizedAt().toString());
    }
}
