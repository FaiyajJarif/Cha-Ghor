package com.chaghor.chaghor.supply.dto;

import java.math.BigDecimal;

// A single GPS fix posted by a driver's browser to the public tracking link
// (POST /supply/track/{token}/location). speedKmh + headingDeg are optional
// (the Geolocation API doesn't always provide them).
public record LocationPingRequest(
        BigDecimal lat,
        BigDecimal lng,
        Integer speedKmh,
        BigDecimal headingDeg) {
}
