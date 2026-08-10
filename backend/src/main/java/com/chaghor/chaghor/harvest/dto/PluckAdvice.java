package com.chaghor.chaghor.harvest.dto;

import java.math.BigDecimal;
import java.util.List;

// "Which field should be plucked next, and why."
//
// WHY THIS IS THE RIGHT AI FEATURE FOR THIS PAGE
//   Tea is plucked on a round: a bush is picked, allowed to flush, and picked
//   again roughly every 7-10 days. Leaf left past the round gets coarse, and
//   coarse leaf grades down. That is not a guess -- it is exactly what the
//   TeaLeafAgeQuality dataset in ai_service encodes: leaf 1-2 days old is
//   graded A, leaf 7+ days old is graded B. So DAYS SINCE LAST PLUCK is a
//   measurable predictor of tomorrow's quality, and every row needed to compute
//   it is already in leaf_collection.
//
// WHY THE RANKING IS ARITHMETIC AND NOT A MODEL
//   The photo grader was measured at 56.7% against a 51% baseline (p = 0.15) --
//   indistinguishable from guessing. Ranking fields by a number anyone can
//   recompute by hand is worth more than ranking them by a model nobody can
//   audit. The LLM writes the paragraph; it never chooses the order, and if the
//   AI service is down `narrative` is null and the table is unaffected.
public record PluckAdvice(

        // Ranked, most urgent first.
        List<Field> fields,

        // The estate-wide caveat: heavy rain in the last reading. Weather is
        // recorded for the estate, not per field, so it is stated once here
        // rather than repeated against each row as though it were measured
        // separately for each one.
        String weatherNote,

        // The expected pluck round, in days. Shown so the reader can see what
        // "overdue" is being measured against instead of trusting a label.
        int cycleDays,

        // Written by the AI service from the numbers above. Null when the
        // service is unavailable -- the ranking stands on its own.
        String narrative,

        // Set when the narrative could not be produced, so the UI can say why
        // instead of silently showing nothing.
        String narrativeError) {

    public record Field(
            Long zoneId,
            String zoneName,

            // Null when this field has never had a weigh-in. Deliberately
            // distinct from a large number: "no data" is not "very overdue".
            Integer daysSinceLastPluck,
            java.time.LocalDate lastPluckDate,

            // daysSinceLastPluck - cycleDays. Negative means still resting.
            Integer daysOverdue,

            // Mean kg per plucking day over the recent window, so a supervisor
            // can weigh urgency against what the field actually yields.
            BigDecimal recentAvgKg,

            // OVERDUE | DUE | RESTING | CLOSED | NO_DATA
            String band,

            // A plain sentence for this row. Written in Java, not by the model.
            String reason) {
    }
}
