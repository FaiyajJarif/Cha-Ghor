package com.chaghor.chaghor.payroll.dto;

import jakarta.validation.constraints.DecimalMin;

import java.math.BigDecimal;

// Body for PUT /payroll/{id}/deductions.
//
// Every field is OPTIONAL -- the service only applies the ones that are
// present, so a null means "leave this deduction as it is". That is why there
// is no @NotNull here: adding one would break partial edits.
//
// What is enforced is that a supplied amount cannot be negative. Without this,
// a negative deduction reached the database and was rejected by
// chk_payroll_amounts_nonneg (V14) as a raw 500. Now it comes back as a
// readable field message before anything touches the payslip.
public record DeductionRequest(
        @DecimalMin(value = "0.0", message = "Loan deduction cannot be negative")
        BigDecimal loanDeduction,

        @DecimalMin(value = "0.0", message = "Advance recovery cannot be negative")
        BigDecimal advanceRecovery,

        @DecimalMin(value = "0.0", message = "Other deduction cannot be negative")
        BigDecimal otherDeduction) {
}
