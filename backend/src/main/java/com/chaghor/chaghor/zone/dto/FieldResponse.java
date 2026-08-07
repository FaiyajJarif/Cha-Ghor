package com.chaghor.chaghor.zone.dto;

import java.math.BigDecimal;

// One field, with everything the Fields board shows about it.
//
// The live numbers (workers, yield, efficiency) are computed for a given day
// from attendance and leaf_collection rather than stored, so they can never
// drift out of step with the registers they come from.
//
// `efficiencyPct` is null when the field has no daily target — a percentage
// against an unknown target would be meaningless, and showing 0% would read as
// "this field failed" rather than "nobody set a target".
public record FieldResponse(
        Long id,
        String name,
        String code,
        String status,        // active | maintenance | resting
        String condition,     // good | caution | poor
        String fieldNote,
        String photoUrl,
        BigDecimal areaHectare,
        BigDecimal targetKgPerDay,

        // position on the map
        boolean placed,
        Double lat,
        Double lng,
        Integer radiusM,

        // today (or the requested date)
        long workersPresent,
        BigDecimal yieldKg,
        long weighIns,
        Integer efficiencyPct) {
}
