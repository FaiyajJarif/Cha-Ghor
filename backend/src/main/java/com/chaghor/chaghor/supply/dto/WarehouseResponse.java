package com.chaghor.chaghor.supply.dto;

import java.math.BigDecimal;

// The estate warehouse marker for the admin live map (GET /supply/warehouse).
public record WarehouseResponse(
        String name,
        BigDecimal lat,
        BigDecimal lng) {
}
