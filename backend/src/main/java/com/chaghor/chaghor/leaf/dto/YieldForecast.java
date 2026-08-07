package com.chaghor.chaghor.leaf.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

// Tomorrow's expected leaf, per field and for the estate.
//
// THIS IS ARITHMETIC, NOT A MODEL. It is a weighted average of what each field
// actually produced per worker recently, multiplied by the people expected to
// be there, then adjusted for rain. Every input is named in `basis` so a
// supervisor can disagree with the reasoning rather than the number.
//
// Deliberately NOT machine learning: with a few weeks of data an ML model would
// be fitting noise, and the honest version of this problem is a short average
// with its assumptions written down. `confidence` reflects how much history the
// figure rests on, so a forecast built from three days says so.
public record YieldForecast(
        LocalDate forDate,
        BigDecimal estateKg,
        int workersAssumed,
        String confidence,       // GOOD | FAIR | WEAK
        String weatherNote,      // null when no reading is available
        List<Field> fields,
        List<String> basis) {

    public record Field(
            Long zoneId,
            String zoneName,
            BigDecimal expectedKg,
            BigDecimal kgPerWorker,   // the recent average this rests on
            int workersAssumed,
            int daysOfHistory,
            BigDecimal targetKgPerDay,
            String note) {
    }
}
