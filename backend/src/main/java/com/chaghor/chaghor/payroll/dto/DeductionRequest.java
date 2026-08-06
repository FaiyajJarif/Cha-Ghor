package com.chaghor.chaghor.payroll.dto;

import java.math.BigDecimal;

// Body for PUT /payroll/{id}/deductions.
public record DeductionRequest(
        BigDecimal loanDeduction,
        BigDecimal advanceRecovery,
        BigDecimal otherDeduction) {
}
