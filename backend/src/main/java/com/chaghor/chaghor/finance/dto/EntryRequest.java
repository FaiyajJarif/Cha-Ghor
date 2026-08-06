package com.chaghor.chaghor.finance.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

// Create-entry payload from the "Add entry" modal. category/status arrive as the
// enum names (REVENUE/EXPENSE/PAYROLL/LOAN, SETTLED/PENDING); dueDate applies
// only to PENDING entries.
//
// Phase 1: hardened with Bean Validation. Requires @Valid on the controller
// param (added in FinanceController).
public record EntryRequest(
        @NotNull LocalDate entryDate,
        String refId,
        @NotBlank String category,
        @NotBlank String account,
        @NotNull @DecimalMin(value = "0.0", inclusive = true, message = "amount must be >= 0") BigDecimal amount,
        @NotBlank String status,
        LocalDate dueDate,
        String note) {
}
