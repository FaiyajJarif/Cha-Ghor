package com.chaghor.chaghor.auth.dto;

import com.chaghor.chaghor.user.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

// What an admin must supply to create an account.
//
// Every message here is written to be read by an estate clerk, not a developer.
// The default Bean Validation text ("size must be between 8 and 72") is exactly
// the kind of thing that makes someone give up and pick "123456".
public record RegisterRequest(

        // Letters, digits, dot, underscore and hyphen. No spaces, because a
        // username with a trailing space is impossible to diagnose over the
        // phone -- it looks identical to the one that works.
        @NotBlank(message = "A username is required.")
        @Size(min = 3, max = 60, message = "Username must be between 3 and 60 characters.")
        @Pattern(regexp = "^[A-Za-z0-9._-]+$",
                 message = "Username can use letters, numbers, dot, underscore and hyphen only - no spaces.")
        String username,

        // Optional, because a tea plucker may genuinely not have one and an
        // account must not be blocked on that. Validated when present.
        @Email(message = "That email address does not look right.")
        @Size(max = 160, message = "Email is too long.")
        String email,

        // MINIMUM 8. Six characters over a public login form is roughly two
        // hours of guessing.
        //
        // MAXIMUM 72 for a real reason: BCrypt silently ignores everything past
        // 72 bytes. Without a cap the system would accept a 200-character
        // passphrase and quietly authenticate on the first 72, so two different
        // passwords would both work and nobody would ever know.
        // Same rule as self-service signup. An admin-created account is not a
        // lesser account -- a supervisor login with "12345678" is the same hole
        // whoever typed it.
        @NotBlank(message = "A password is required.")
        @Pattern(regexp = "^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,72}$",
                 message = "Password must be 8-72 characters and include a capital letter, a small letter, a number and a symbol such as ! # or @.")
        String password,

        @NotNull(message = "Choose a role: admin, supervisor or worker.")
        Role role
) {
}
