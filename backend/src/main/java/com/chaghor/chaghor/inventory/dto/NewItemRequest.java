package com.chaghor.chaghor.inventory.dto;

import java.math.BigDecimal;

// Payload for POST /inventory/items (admin only).
public record NewItemRequest(
        String name,
        String category,
        String codeLabel,
        String codeValue,
        BigDecimal quantity,
        BigDecimal capacity,
        String unit,
        BigDecimal unitValue,
        BigDecimal reorderLevel,
        String site
) {}
