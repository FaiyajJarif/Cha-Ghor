package com.chaghor.chaghor.payroll.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record PayrollConfigResponse(
        Long id,
        BigDecimal baseDailyWage,
        BigDecimal leafQuotaKg,
        BigDecimal surplusRate,
        BigDecimal gradeBonusRate,
        BigDecimal advanceCap,
        BigDecimal loanCap,
        BigDecimal loanDailyDeduction,
        LocalDate effectiveFrom) {
}
