package com.chaghor.chaghor.weather.dto;

import java.math.BigDecimal;
import java.util.List;

// Current conditions for the Weather Status card.
//
// `available` is false when no reading has ever been fetched. The UI shows that
// as "no reading yet" rather than 0°C, which would look like a real measurement.
public record WeatherResponse(
        boolean available,
        String message,
        BigDecimal tempC,
        BigDecimal feelsLikeC,
        BigDecimal humidity,
        BigDecimal rainfall24hMm,
        String condition,
        String observedAt,
        String source,
        List<ForecastDay> forecast) {

    // One row of the 3-day forecast summary in the design.
    public record ForecastDay(String day, String condition, BigDecimal minC, BigDecimal maxC) {
    }

    public static WeatherResponse unavailable(String message) {
        return new WeatherResponse(false, message, null, null, null, null, null, null, null, List.of());
    }
}
