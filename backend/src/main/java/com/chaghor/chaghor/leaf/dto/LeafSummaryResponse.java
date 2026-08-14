package com.chaghor.chaghor.leaf.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

// Small summary card for a single day: how many plucks and total kg.
public record LeafSummaryResponse(
        LocalDate date,
        long entries,
        BigDecimal totalKg
) {}
