package com.chaghor.chaghor.leaf.dto;

import java.math.BigDecimal;

// How one field is weighing in today, against two different yardsticks.
//
// WHY TWO: comparing a field only to the estate average punishes a field that
// is genuinely harder to pluck — steep, young bushes, whatever — for being
// itself. Comparing it only to its own history misses a field that is quietly
// under-performing everything around it. A supervisor needs both, and they can
// disagree: a field can be having a good day by its own standards and still be
// the weakest on the estate.
//
// `band` is what colours the map:
//   GOOD    — clearly ahead of its own norm
//   NORMAL  — about where it usually is
//   LOW     — clearly behind its own norm
//   NO_DATA — nothing weighed in yet today, which is NOT the same as zero.
//             A field nobody has reached yet must not be coloured as failing.
public record ZonePerformance(
        Long zoneId,
        String zoneName,
        String code,
        int workersPresent,
        BigDecimal kgToday,
        BigDecimal kgPerWorkerToday,
        // This field's own average kg-per-worker over the recent window,
        // excluding today, so today is compared against a norm it is not in.
        BigDecimal ownAverage,
        // The estate-wide average kg-per-worker over the same window.
        BigDecimal estateAverage,
        // Percent difference vs its own norm, and vs the estate. Null when
        // there is not enough history to make the comparison honest.
        Double vsOwnPct,
        Double vsEstatePct,
        String band,
        // One sentence a supervisor can act on, naming the numbers behind it.
        String verdict) {
}
