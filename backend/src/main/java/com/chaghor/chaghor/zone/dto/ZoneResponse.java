package com.chaghor.chaghor.zone.dto;

import java.math.BigDecimal;

// A field, with its position on the map when one has been set.
//
// lat/lng/radiusM are unpacked from the stored GeoJSON so the frontend never
// has to parse it. `placed` is false when the field has no position yet — the
// map then lists it as unplaced instead of dropping a pin somewhere nobody
// chose.
public record ZoneResponse(
        Long id,
        String name,
        String code,
        BigDecimal areaHectare,
        BigDecimal targetKgPerDay,
        boolean placed,
        Double lat,
        Double lng,
        Integer radiusM) {
}
