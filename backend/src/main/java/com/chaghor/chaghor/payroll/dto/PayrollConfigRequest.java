package com.chaghor.chaghor.payroll.dto;

import jakarta.validation.constraints.DecimalMin;

import java.math.BigDecimal;

// Body for PUT /payroll/config (all fields optional; nulls keep the old value).
//
// No @NotNull anywhere on purpose -- the config screen sends only the rates the
// admin actually changed, and a null must continue to mean "leave this rate
// alone". What is enforced is that a supplied rate cannot be negative: a
// negative daily wage or surplus rate would silently invert the wage formula
// for every worker on the estate.
public record PayrollConfigRequest(
        @DecimalMin(value = "0.0", message = "Daily wage cannot be negative")
        BigDecimal baseDailyWage,

        @DecimalMin(value = "0.0", message = "Leaf quota cannot be negative")
        BigDecimal leafQuotaKg,

        @DecimalMin(value = "0.0", message = "Surplus rate cannot be negative")
        BigDecimal surplusRate,

        @DecimalMin(value = "0.0", message = "Grade bonus rate cannot be negative")
        BigDecimal gradeBonusRate) {
}
