package com.chaghor.chaghor.supply.dto;

import com.chaghor.chaghor.supply.Shipment;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;

// Public payload for GET /supply/track/{token}. Deliberately minimal: no ids,
// buyers or revenue — just what a driver / recipient needs to see the route on
// a map. Warehouse coordinates are injected by the service from config.
public record TrackResponse(
        String code,
        String vehicle,
        String origin,
        String destination,
        String status,
        BigDecimal currentLat,
        BigDecimal currentLng,
        Integer speedKmh,
        OffsetDateTime lastPingAt,
        boolean live,
        BigDecimal warehouseLat,
        BigDecimal warehouseLng,
        String warehouseName) {

    public static TrackResponse from(
            Shipment s, String warehouseName, BigDecimal warehouseLat, BigDecimal warehouseLng) {
        boolean live =
                s.getLastPingAt() != null
                        && Duration.between(s.getLastPingAt(), OffsetDateTime.now()).getSeconds()
                                <= 120;
        return new TrackResponse(
                s.getCode(),
                s.getVehicle(),
                s.getOrigin(),
                s.getDestination(),
                s.getStatus().name(),
                s.getCurrentLat(),
                s.getCurrentLng(),
                s.getSpeedKmh(),
                s.getLastPingAt(),
                live,
                warehouseLat,
                warehouseLng,
                warehouseName);
    }
}
