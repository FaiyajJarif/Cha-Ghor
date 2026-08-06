package com.chaghor.chaghor.loan.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

// Payload for recording a repayment against an ACTIVE / OVERDUE loan.
// paidOn defaults to today when omitted.
public record NewRepaymentRequest(
        @NotNull @Positive BigDecimal amount,
        LocalDate paidOn,
        String note) {
}
