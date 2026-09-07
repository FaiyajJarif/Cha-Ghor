package com.chaghor.chaghor.withdrawal.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

// Payload for POST /api/v1/withdrawals. `method` is optional and defaults to
// "bkash" (the only supported method; payout is mocked).
public record NewWithdrawalRequest(
        @NotNull(message = "workerId is required") Long workerId,
        @NotNull(message = "amount is required")
        @Positive(message = "amount must be greater than 0") BigDecimal amount,
        String method
) {}
