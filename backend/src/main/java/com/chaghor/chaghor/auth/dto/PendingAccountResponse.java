package com.chaghor.chaghor.auth.dto;

import com.chaghor.chaghor.user.User;

import java.time.OffsetDateTime;
import java.util.List;

// One row in the admin's account-approval queue.
//
// Deliberately NOT UserResponse. That record carries notification preferences,
// avatar and locale — none of which help someone decide whether to let a
// stranger onto the payroll, and all of which pad the payload of an endpoint
// that lists people who have not been trusted yet.
//
// What the office actually needs to decide: who says they are, what they are
// asking to be, how to reach them, and when they asked.
public record PendingAccountResponse(
        Long id,
        String username,
        String displayName,
        String email,
        String phone,
        String role,
        OffsetDateTime requestedAt,

        // Unlinked worker records the admin can attach this login to.
        //
        // SUGGESTIONS, NOT A DECISION. `nameMatches` flags the ones whose name
        // is the same, purely so the likely row floats to the top of a list --
        // the server never acts on it. Two workers may share a name, and
        // picking one by string comparison would hand one man's wages to
        // another with nothing on screen to show it happened.
        List<WorkerCandidate> candidates
) {
    public static PendingAccountResponse from(User u) {
        return from(u, List.of());
    }

    public static PendingAccountResponse from(User u, List<WorkerCandidate> candidates) {
        return new PendingAccountResponse(
                u.getId(),
                u.getUsername(),
                u.getDisplayName(),
                u.getEmail(),
                u.getPhone(),
                u.getRole().name(),
                u.getRequestedAt(),
                candidates == null ? List.of() : candidates);
    }
}
