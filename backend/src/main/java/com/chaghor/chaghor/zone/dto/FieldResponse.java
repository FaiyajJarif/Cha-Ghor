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
        Integer efficiencyPct,

        // A SUGGESTED ground condition and why, or null when there is nothing
        // worth saying. Computed in ZoneService.suggestCondition from this
        // field's yield against its own 14-day average, softened by recent
        // rainfall.
        //
        // Never written anywhere. `condition` above is what the supervisor
        // actually recorded; this is a question put to them. V23's reasoning
        // still holds -- what a field looks like is something a person sees
        // standing in it -- so the most this can honestly do is point at a
        // field worth walking.
        String suggestedCondition,
        String conditionReason) {
}
