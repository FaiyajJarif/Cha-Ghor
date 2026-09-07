package com.chaghor.chaghor.loan.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One row of the "Pending Loan Requests" table.
public record LoanRequestResponse(
        Long id,
        String workerName,
        String zone,
        String avatarUrl,
        BigDecimal amount,
        String reason,
        String status,
        OffsetDateTime requestedAt
) {}
