package com.chaghor.chaghor.settings.dto;

public record NotificationPrefsRequest(
        boolean notifyBroadcast,
        boolean notifyAttendance,
        boolean notifyPayroll
) {
}
