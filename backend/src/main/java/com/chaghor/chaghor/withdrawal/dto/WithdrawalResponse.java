package com.chaghor.chaghor.withdrawal.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record WithdrawalResponse(
        Long id,
        Long workerId,
        String workerName,
        String zone,
        BigDecimal amount,
        String method,
        String status,
        OffsetDateTime requestedAt,
        OffsetDateTime processedAt
) {}
