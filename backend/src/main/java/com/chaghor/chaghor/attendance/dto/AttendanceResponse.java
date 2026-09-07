package com.chaghor.chaghor.attendance.dto;

import java.time.LocalDate;

// One saved attendance mark.
//
// `applied` says whether this call actually changed the row. A replayed offline
// write that lost a conflict comes back applied=false with a reason, so the
// handset can stop retrying and, more importantly, so the supervisor is not
// told "saved" about a mark the server deliberately discarded.
public record AttendanceResponse(
        Long workerId,
        LocalDate date,
        String status,
        Long zoneId,
        Integer lateMinutes,
        boolean applied,
        String note) {

    public static AttendanceResponse applied(Long workerId, LocalDate date, String status,
                                             Long zoneId, Integer lateMinutes) {
        return new AttendanceResponse(workerId, date, status, zoneId, lateMinutes, true, null);
    }

    public static AttendanceResponse skipped(Long workerId, LocalDate date, String status,
                                             Long zoneId, Integer lateMinutes, String note) {
        return new AttendanceResponse(workerId, date, status, zoneId, lateMinutes, false, note);
    }
}
