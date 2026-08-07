package com.chaghor.chaghor.leaf.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record LeafResponse(
        Long id,
        Long workerId,
        String workerName,
        String zone,
        Long zoneId,
        LocalDate date,
        BigDecimal weightKg,
        String grade,
        // When the weigh-in was actually recorded, so the supervisor screen can
        // show "10:15 AM" against each entry. The column has always existed;
        // it just was not surfaced.
        String recordedAt
) {}
