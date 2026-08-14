package com.chaghor.chaghor.payroll.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

// Aggregated counts + totals for a period (feeds KPI cards / Overview later).
public record PayrollSummaryResponse(
        LocalDate periodStart,
        LocalDate periodEnd,
        int count,
        int draft,
        int review,
        int approved,
        int paid,
        BigDecimal totalGross,
        BigDecimal totalNet) {
}
