package com.chaghor.chaghor.auth.dto;

import com.chaghor.chaghor.user.User;

public record UserResponse(
        Long id,
        String username,
        String email,
        String role,
        String locale,
        String displayName,
        String phone,
        String avatarUrl,
        boolean notifyBroadcast,
        boolean notifyAttendance,
        boolean notifyPayroll
) {
    public static UserResponse from(User u) {
        return new UserResponse(
                u.getId(),
                u.getUsername(),
                u.getEmail(),
                u.getRole().name(),
                u.getLocale().name(),
                u.getDisplayName(),
                u.getPhone(),
                u.getAvatarUrl(),
                u.isNotifyBroadcast(),
                u.isNotifyAttendance(),
                u.isNotifyPayroll());
    }
}
