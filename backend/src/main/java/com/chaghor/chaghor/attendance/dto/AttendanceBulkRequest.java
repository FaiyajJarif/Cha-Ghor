package com.chaghor.chaghor.attendance.dto;

import java.time.LocalDate;
import java.util.List;

// Payload the attendance sheet posts on Save: one date + a row per worker.
public record AttendanceBulkRequest(LocalDate date, List<AttendanceEntryRequest> entries) {}
