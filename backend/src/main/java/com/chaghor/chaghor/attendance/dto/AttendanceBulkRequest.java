package com.chaghor.chaghor.attendance.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

// Payload the attendance sheet posts on Save: one date + a row per worker.
//
// @Valid on the list matters as much as the annotations themselves -- without
// it, constraints on AttendanceEntryRequest are never evaluated for the nested
// rows, only for the outer object.
public record AttendanceBulkRequest(
        @NotNull(message = "A date is required")
        LocalDate date,

        @NotEmpty(message = "No attendance entries were provided")
        List<@Valid AttendanceEntryRequest> entries) {
}
