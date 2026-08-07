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
        List<ForecastDay> forecast,
        // Added for the Weather Monitor screen. All three come from the same
        // Open-Meteo call and live in forecast_json, so no migration was needed.
        // Any of them may be null on a reading fetched before they existed --
        // the UI shows those as "--" rather than 0, which would read as a real
        // measurement of no wind.
        BigDecimal windKph,
        BigDecimal rainProbPct,
        List<HourPoint> hourly) {

    // One row of the 7-day forecast summary.
    public record ForecastDay(String day, String condition, BigDecimal minC, BigDecimal maxC) {
    }

    // One hour of the strip across the top of Today's Condition. `now` marks
    // the hour the reading was taken in, so the UI does not have to guess which
    // column to highlight from the client clock.
    public record HourPoint(String time, BigDecimal tempC, BigDecimal rainProbPct,
                            String condition, boolean now) {
    }

    public static WeatherResponse unavailable(String message) {
        return new WeatherResponse(false, message, null, null, null, null, null, null, null,
                List.of(), null, null, List.of());
    }
}
