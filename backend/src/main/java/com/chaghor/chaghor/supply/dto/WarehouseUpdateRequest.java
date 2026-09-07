package com.chaghor.chaghor.supply.dto;

import java.math.BigDecimal;

// Body for PUT /api/v1/supply/warehouse — relocate the estate warehouse marker
// on the live map. Latitude must be -90..90, longitude -180..180.
public record WarehouseUpdateRequest(
        String name,
        BigDecimal lat,
        BigDecimal lng) {}
