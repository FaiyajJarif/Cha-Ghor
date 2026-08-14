package com.chaghor.chaghor.weather;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;

// A weather reading for the estate (table from V1, wired here for the first
// time -- it previously had no Java at all).
//
// One row per fetch, not one per day: log_date is a DATE, so several readings
// on the same day are separate rows distinguished by id. That is what lets the
// 24-hour trend chart plot a curve rather than a single point.
//
// zone_id is nullable and left null for now: the free forecast API gives one
// reading for the estate's coordinates, not per zone. Per-zone readings would
// need either separate coordinates per zone or on-site sensors.
@Entity
@Table(name = "weather_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WeatherLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "log_date", nullable = false)
    @Builder.Default
    private LocalDate logDate = LocalDate.now();

    @Column(name = "temp_c")
    private BigDecimal tempC;

    @Column(name = "humidity")
    private BigDecimal humidity;

    @Column(name = "rainfall_mm")
    private BigDecimal rainfallMm;

    @Column(name = "condition", length = 80)
    private String condition;

    @Column(name = "source", length = 80)
    private String source;

    // The multi-day forecast, kept as JSON so the shape can change without a
    // migration. Read back verbatim by the dashboard.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "forecast_json", columnDefinition = "jsonb")
    private String forecastJson;
}
