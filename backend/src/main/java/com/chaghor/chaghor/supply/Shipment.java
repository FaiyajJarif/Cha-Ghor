package com.chaghor.chaghor.supply;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// A single outbound shipment / route in the supply chain. Feeds the Live
// Shipment Tracker, the Active Routes panel, and the In Transit / Delivered /
// Active Shipments KPIs. VARCHAR enum via @Enumerated(STRING); created_at is
// DB-defaulted (insertable = false). V10 adds the live-tracking columns.
@Entity
@Table(name = "shipment")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Shipment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "code", nullable = false, length = 40)
    @Builder.Default
    private String code = "";

    @Column(name = "vehicle", length = 40)
    private String vehicle;

    @Column(name = "origin", nullable = false, length = 80)
    @Builder.Default
    private String origin = "";

    @Column(name = "destination", nullable = false, length = 80)
    @Builder.Default
    private String destination = "";

    @Column(name = "weight_kg", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal weightKg = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private ShipmentStatus status = ShipmentStatus.LOADING;

    @Column(name = "on_time", nullable = false)
    @Builder.Default
    private boolean onTime = true;

    @Column(name = "eta_text", length = 60)
    private String etaText;

    @Column(name = "speed_kmh")
    private Integer speedKmh;

    // ---- live tracking (V10) ----
    // Unguessable public token that authorizes the no-login /track/{token} page.
    @Column(name = "track_token", nullable = false, length = 40)
    private String trackToken;

    @Column(name = "current_lat", precision = 9, scale = 6)
    private BigDecimal currentLat;

    @Column(name = "current_lng", precision = 9, scale = 6)
    private BigDecimal currentLng;

    @Column(name = "heading_deg", precision = 5, scale = 1)
    private BigDecimal headingDeg;

    @Column(name = "last_ping_at")
    private OffsetDateTime lastPingAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
