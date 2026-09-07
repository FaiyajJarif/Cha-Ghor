package com.chaghor.chaghor.payroll.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

// One point on the "Net Pay Trend" chart: the total net pay for a single
// payroll period. Built directly by a JPQL constructor expression in
// PayrollRepository.findNetTrend(...).
public record TrendPoint(
        LocalDate periodStart,
        LocalDate periodEnd,
        BigDecimal totalNet) {
}
