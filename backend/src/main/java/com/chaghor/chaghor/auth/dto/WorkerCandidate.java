package com.chaghor.chaghor.auth.dto;

// A worker record an applicant might be, offered to the admin to CHOOSE from.
//
// Deliberately carries the details that tell two same-named people apart --
// zone, phone, join date. "Abdul Karim" on its own is not enough to decide
// whose wages a login is about to be attached to, which is exactly the mistake
// this type exists to prevent.
public record WorkerCandidate(
        Long id,
        String fullName,
        String phone,
        String zoneName,
        String joinDate,
        boolean nameMatches
) {
}
