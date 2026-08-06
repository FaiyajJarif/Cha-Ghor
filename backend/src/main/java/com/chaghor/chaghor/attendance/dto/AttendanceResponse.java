package com.chaghor.chaghor.attendance.dto;

import java.time.LocalDate;

public record AttendanceResponse(Long workerId, LocalDate date, String status, Long zoneId) {}
