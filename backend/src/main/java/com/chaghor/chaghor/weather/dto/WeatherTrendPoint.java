package com.chaghor.chaghor.weather.dto;

import java.math.BigDecimal;

// One point on the 24-hour temperature / humidity curve.
public record WeatherTrendPoint(String time, BigDecimal tempC, BigDecimal humidity) {
}
