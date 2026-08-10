package com.chaghor.chaghor.weather.dto;

import java.math.BigDecimal;

// How much a wet day actually costs THIS estate, measured from its own records.
//
// WHY THIS EXISTS
//   LeafCollectionService.forecast() cuts tomorrow's expectation by 25% when
//   the last reading showed heavy rain. That 0.75 was invented -- a plausible
//   guess written into the code with nothing behind it. Meanwhile weather_log
//   and leaf_collection have been accumulating paired readings and yields for
//   the same days, which is exactly what is needed to replace the guess with a
//   number.
//
// WHY KG PER WORKER, NOT TOTAL KG
//   Fewer people turn up on wet days. Comparing raw daily totals would measure
//   attendance as much as rain and overstate the effect -- possibly by a lot.
//   Dividing by the headcount that was actually present isolates "how much did
//   each plucker manage", which is the thing rain affects.
//
// WHY IT CAN REFUSE
//   An estate with three wet days on record cannot support a claim about wet
//   days. `enoughData` is false below the minimum and `factor` is null; callers
//   fall back to the documented constant and say so. A measured-looking number
//   computed from four rows would be worse than the honest guess it replaced.
public record RainImpact(

        // Wet-day yield as a fraction of dry-day yield, per worker present.
        // 0.75 means a wet day brings in three quarters of a dry one. Null when
        // there is not enough data to say.
        BigDecimal factor,

        // What the code falls back to without enough evidence. Stated so the
        // reader can see how far the measurement moved it, if at all.
        BigDecimal fallbackFactor,

        // True when both samples clear the minimum. When false, `factor` is
        // null and nothing downstream should use it.
        boolean enoughData,

        int wetDays,
        int dryDays,

        // Mean kg per worker present on each kind of day -- the two numbers the
        // factor is a ratio of, shown so it can be checked by hand.
        BigDecimal wetAvgKgPerWorker,
        BigDecimal dryAvgKgPerWorker,

        // The rainfall reading at or above which a day counts as wet, in mm.
        BigDecimal wetThresholdMm,

        // How far back the comparison looked.
        int windowDays,

        // A plain sentence: what was measured, or why it could not be.
        String summary) {
}
