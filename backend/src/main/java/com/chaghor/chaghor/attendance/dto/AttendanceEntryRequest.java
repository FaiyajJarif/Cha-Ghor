package com.chaghor.chaghor.attendance.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

// One row of the attendance sheet.
//
// AttendanceService already rejected a null workerId by hand; these annotations
// move that check earlier and turn it into a per-field message the sheet can
// show against the offending row, instead of one generic error for the whole
// save. The service checks stay as they are -- they are the backstop for any
// caller that does not go through @Valid.
public record AttendanceEntryRequest(
        @NotNull(message = "Each row needs a worker")
        Long workerId,

        @NotBlank(message = "Each row needs a status (present, absent, late or leave)")
        String status,

        // Which field the worker is assigned to FOR THIS DAY.
        //
        // Optional, and null means "use the worker's home zone" -- which is what
        // the service did unconditionally before. Pluckers get moved between
        // fields day to day, and attendance.zone_id has always existed to record
        // that; nothing was ever able to set it to anything but the default.
        Long zoneId) {
}
