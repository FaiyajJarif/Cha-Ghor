package com.chaghor.chaghor.attendance.dto;

// One worker's status in a bulk save. status is "present" | "absent" | "leave".
public record AttendanceEntryRequest(Long workerId, String status) {}
