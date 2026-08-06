package com.chaghor.chaghor.leaf.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record LeafResponse(
        Long id,
        Long workerId,
        String workerName,
        String zone,
        LocalDate date,
        BigDecimal weightKg,
        String grade
) {}
