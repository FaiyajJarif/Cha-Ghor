package com.chaghor.chaghor.auth.dto;

import com.chaghor.chaghor.user.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank String username,
        @Email String email,
        @NotBlank @Size(min = 6) String password,
        @NotNull Role role
) {
}
