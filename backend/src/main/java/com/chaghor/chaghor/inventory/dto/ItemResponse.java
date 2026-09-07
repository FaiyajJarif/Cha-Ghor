package com.chaghor.chaghor.inventory.dto;

import java.math.BigDecimal;

// One row of the inventory table. `stockLevelPct` and `status` are derived.
public record ItemResponse(
        Long id,
        String name,
        String codeLabel,
        String codeValue,
        String category,
        String unit,
        BigDecimal quantity,
        BigDecimal capacity,
        int stockLevelPct,
        String status, // IN_STOCK | LOW_STOCK
        String site
) {}
