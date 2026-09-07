package com.chaghor.chaghor.zone.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

// Where a supervisor placed a field on the map.
//
// The bounds are real validation, not decoration: a swapped lat/lng is the
// classic mistake with map coordinates and would silently drop the field in the
// wrong hemisphere. Latitude cannot exceed 90, so a longitude in the latitude
// slot is rejected outright for most of the world.
public record ZoneGeometryRequest(
        @NotNull(message = "A latitude is required")
        @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
        @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
        Double lat,

        @NotNull(message = "A longitude is required")
        @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
        @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
        Double lng,

        // Radius, not diameter: the UI asks for a diameter because that is what
        // a supervisor pacing a field thinks in, and halves it before sending.
        @NotNull(message = "A radius is required")
        @Min(value = 10, message = "A field must be at least 10 m across")
        @Max(value = 5000, message = "A field cannot be more than 5 km across")
        Integer radiusM) {
}
