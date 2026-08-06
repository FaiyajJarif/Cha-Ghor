package com.chaghor.chaghor.settings.dto;

// All fields optional; null means "leave unchanged".
public record ProfileUpdateRequest(
        String displayName,
        String email,
        String phone,
        String locale,
        String avatarUrl
) {
}
