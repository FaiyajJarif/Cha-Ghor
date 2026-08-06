package com.chaghor.chaghor.supply.dto;

import com.chaghor.chaghor.supply.Shipment;
import com.chaghor.chaghor.supply.ShipmentStatus;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;

// A shipment for the Active Routes list + Live Shipment Tracker. Now also
// carries the latest reported GPS position (currentLat/Lng), a `live` flag
// (pinged within the last 120s) and the public trackToken so the admin board
// can build the driver's share link.
public record ShipmentResponse(
        Long id,
        String code,
        String vehicle,
        String origin,
        String destination,
        BigDecimal weightKg,
        String status,
        boolean onTime,
        String etaText,
        Integer speedKmh,
        BigDecimal currentLat,
        BigDecimal currentLng,
        OffsetDateTime lastPingAt,
        boolean live,
        String trackToken) {

    public static ShipmentResponse from(Shipment s) {
        return new ShipmentResponse(
                s.getId(),
                s.getCode(),
                s.getVehicle(),
                s.getOrigin(),
                s.getDestination(),
                s.getWeightKg(),
                s.getStatus().name(),
                s.isOnTime(),
                s.getEtaText(),
                s.getSpeedKmh(),
                s.getCurrentLat(),
                s.getCurrentLng(),
                s.getLastPingAt(),
                isLive(s),
                s.getTrackToken());
    }

    // A shipment is "live" only while a driver is actively sharing GPS on an
    // in-progress shipment. Two guards:
    //   1. A DELIVERED shipment is never live -- tracking is finished, even if a
    //      driver's browser tab is still open in the background and pinging.
    //   2. The last ping must be recent (within LIVE_WINDOW_SECONDS); once the
    //      driver stops sharing, no new pings arrive and the flag goes stale.
    private static final long LIVE_WINDOW_SECONDS = 90;

    private static boolean isLive(Shipment s) {
        if (s.getStatus() == ShipmentStatus.DELIVERED) {
            return false;
        }
        OffsetDateTime lastPingAt = s.getLastPingAt();
        return lastPingAt != null
                && Duration.between(lastPingAt, OffsetDateTime.now()).getSeconds()
                        <= LIVE_WINDOW_SECONDS;
    }
}
