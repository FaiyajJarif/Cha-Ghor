package com.chaghor.chaghor.supply.dto;

import java.math.BigDecimal;

// Payload for the "+ Dispatch Shipment" action.
public record DispatchShipmentRequest(
        String code,
        String vehicle,
        String origin,
        String destination,
        BigDecimal weightKg,
        String status,
        String etaText,
        Integer speedKmh) {
}
