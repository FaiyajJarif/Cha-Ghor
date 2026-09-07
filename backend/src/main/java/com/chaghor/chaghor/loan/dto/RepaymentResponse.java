package com.chaghor.chaghor.loan.dto;

import java.math.BigDecimal;

// One row of the "Active Loan Repayments" table. `progressPct` is derived.
public record RepaymentResponse(
        Long id,
        String reference,
        String workerName,
        String zone,
        String avatarUrl,
        BigDecimal principal,
        BigDecimal repaid,
        BigDecimal dailyDeduction,
        int progressPct,
        String status // ACTIVE | OVERDUE | REPAID
) {}
