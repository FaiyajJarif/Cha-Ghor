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
        OffsetDateTime paidAt,

        // TRUE when the register has moved since this payslip was built.
        //
        // The payslip is a statement now, so a stale one is not blocking any
        // money -- but it IS the document an admin reads out in a wage dispute,
        // and one that quietly disagrees with the register is worse than no
        // document at all. A stale PAID row matters MORE, not less: the month
        // was closed on figures that are no longer true.
        Boolean stale,
        String staleReason) {
}
