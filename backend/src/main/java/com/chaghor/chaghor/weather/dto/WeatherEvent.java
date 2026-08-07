package com.chaghor.chaghor.weather.dto;

import java.math.BigDecimal;

// One line of the weather activity log.
//
// IMPORTANT: these are NOT user-entered incident records. There is no weather
// event table in this system. Each row here is a reading that was actually
// recorded in weather_log, classified server-side by its own numbers -- 12 mm
// of rain becomes "Heavy rainfall / HIGH", 91% humidity becomes "Humidity
// spike / MED", and a reading that crossed nothing is reported as NORMAL
// rather than hidden.
//
// That is why there is no "action taken" or "supervisor" field: nothing in the
// system records who responded to weather or what they did, and inventing those
// columns would put fiction in front of an estate manager. If they are wanted,
// they need a real table behind them.
//
// `zone` is always the estate as a whole. Open-Meteo returns one reading for
// the estate's coordinates, not one per zone -- per-zone weather would need
// on-site sensors.
public record WeatherEvent(
        Long id,
        String observedAt,
        String zone,
        String event,
        String severity,   // HIGH | MED | LOW | NORMAL
        String detail,     // the measurement that triggered the classification
        BigDecimal tempC,
        BigDecimal humidity,
        BigDecimal rainfallMm,
        BigDecimal windKph) {
}
