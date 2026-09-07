package com.chaghor.chaghor.attendance.dto;

import java.time.LocalDate;

// One bar on the supervisor dashboard's attendance trend chart.
// `label` is the weekday name the design shows on the axis.
public record AttendanceTrendPoint(
        LocalDate date,
        String label,
        long present,
        long absent,
        long late,
        long onLeave) {
}
