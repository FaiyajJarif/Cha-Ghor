package com.chaghor.chaghor.supply.dto;

import java.math.BigDecimal;

// Body for PUT /api/v1/supply/shipments/{id} — edit an existing shipment's route
// and haulage details after it has been dispatched. Status and live GPS are not
// changed here (status has its own endpoint).
public record UpdateShipmentRequest(
        String code,
        String vehicle,
        String origin,
        String destination,
        BigDecimal weightKg,
        String etaText,
        Integer speedKmh) {}
