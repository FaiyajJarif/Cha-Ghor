package com.chaghor.chaghor.payroll.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// One payslip row returned to the admin console.
public record PayrollResponse(
        Long id,
        Long workerId,
        String workerName,
        String jobRole,
        Long zoneId,
        String zoneName,
        LocalDate periodStart,
        LocalDate periodEnd,
        Integer presentDays,
        BigDecimal totalLeafKg,
        BigDecimal baseAmount,
        BigDecimal surplusAmount,
        BigDecimal gradeBonus,
        BigDecimal grossAmount,
        BigDecimal loanDeduction,
        BigDecimal advanceRecovery,
        BigDecimal otherDeduction,
        BigDecimal netPayable,
        String status,
        OffsetDateTime paidAt) {
}
