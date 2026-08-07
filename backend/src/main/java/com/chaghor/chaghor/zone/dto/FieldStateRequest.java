package com.chaghor.chaghor.zone.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

// What a supervisor can change about a field from the Fields board.
//
// Every field is optional so the form can send only what changed. The patterns
// mirror the CHECK constraints added in V23, so a bad value is rejected with a
// readable message instead of a database constraint violation.
public record FieldStateRequest(
        @Pattern(regexp = "active|maintenance|resting",
                message = "Status must be active, maintenance or resting")
        String status,

        @Pattern(regexp = "good|caution|poor",
                message = "Condition must be good, caution or poor")
        String condition,

        @Size(max = 2000, message = "Note is too long")
        String fieldNote,

        // Comes from POST /complaints/attachments, which has already validated
        // the file's type and magic bytes.
        @Size(max = 300)
        String photoUrl) {
}
