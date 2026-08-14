package com.chaghor.chaghor.harvest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

// What the Fields board sends when a supervisor plans work.
//
// `date` and `zoneId` are the only required parts: you cannot schedule work
// without saying which field and when. Everything else is genuinely optional --
// plenty of work is planned before anyone knows who will do it or how much it
// will yield, and forcing a guess would only fill the table with invented
// numbers.
public record HarvestScheduleRequest(

        @NotNull(message = "Pick the field this schedule is for.")
        Long zoneId,

        @NotNull(message = "Pick the day this work is planned for.")
        LocalDate date,

        @Size(max = 160, message = "Keep the title under 160 characters.")
        String title,

        String description,

        // daily | weekly | one-off | maintenance. Validated against the CHECK
        // in the service so the error is a sentence rather than a constraint
        // violation stack trace.
        String type,

        @PositiveOrZero(message = "Expected harvest cannot be negative.")
        BigDecimal expectedKg,

        // The worker who will do the work, by ID. Deliberately an ID and not a
        // name -- the old form let a supervisor type free text, which meant a
        // typo produced a schedule assigned to nobody with nothing to detect it.
        Long workerId,

        // draft | planned. A schedule can be saved unfinished; 'done' and
        // 'cancelled' are reached through the status endpoint, not by creating
        // a row in that state.
        String status,

        @Size(max = 400)
        String attachmentUrl,

        // Set by the handset before a create is queued offline, so a replay
        // returns the schedule that already exists instead of adding a second
        // copy of the same job. Null for an ordinary online create.
        java.util.UUID clientUuid) {
}
