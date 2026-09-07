package com.chaghor.chaghor.attendance.dto;

import java.time.LocalDate;

// One day's attendance, for the supervisor dashboard KPI card.
//
// `marked` is the number of rows actually recorded, which is NOT the same as
// the workforce size. It is surfaced separately so the UI can tell "nobody has
// marked the register yet" apart from "everyone was absent" -- those look
// identical if you only report a percentage.
public record AttendanceSummaryResponse(
        LocalDate date,
        long activeWorkers,
        long marked,
        long present,
        long absent,
        long late,
        long onLeave,
        double presentPct) {
}
