package com.chaghor.chaghor.zone.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

// Create or rename a field.
//
// Position is NOT set here -- it is placed on the map afterwards via
// PUT /zones/{id}/geometry. Keeping the two apart means a field can be created
// in the office and pinned later by whoever walks it, which is the order these
// things actually happen in.
public record ZoneUpsertRequest(
        @NotBlank(message = "Give the field a name")
        @Size(max = 120, message = "That name is too long")
        String name,

        @Size(max = 30, message = "That code is too long")
        String code,

        @DecimalMin(value = "0.0", message = "Area cannot be negative")
        BigDecimal areaHectare,

        @DecimalMin(value = "0.0", message = "The daily target cannot be negative")
        BigDecimal targetKgPerDay) {
}
