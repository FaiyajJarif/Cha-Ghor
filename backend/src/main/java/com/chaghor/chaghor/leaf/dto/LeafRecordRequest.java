package com.chaghor.chaghor.leaf.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

// Payload for POST /api/v1/leaf: record one worker's green-leaf pluck.
// `date` defaults to today when omitted. `grade` is optional ("A"|"B"|"C").
public record LeafRecordRequest(
        @NotNull(message = "workerId is required") Long workerId,
        LocalDate date,
        @NotNull(message = "weightKg is required")
        @PositiveOrZero(message = "weightKg cannot be negative") BigDecimal weightKg,
        String grade
) {}
