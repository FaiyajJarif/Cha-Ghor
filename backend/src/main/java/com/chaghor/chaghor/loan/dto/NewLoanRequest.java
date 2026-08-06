package com.chaghor.chaghor.loan.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

// Payload for POST /loans/requests (admin logs a request on a worker's behalf).
//
// Phase 1: hardened with Bean Validation. Requires @Valid on the controller
// param (added in LoanController).
public record NewLoanRequest(
        @NotBlank String workerName,
        String zone,
        @NotNull @DecimalMin(value = "0.0", inclusive = false, message = "amount must be > 0") BigDecimal amount,
        @NotBlank String reason,
        @NotNull @DecimalMin(value = "0.0", inclusive = true, message = "dailyDeduction must be >= 0") BigDecimal dailyDeduction
) {}
