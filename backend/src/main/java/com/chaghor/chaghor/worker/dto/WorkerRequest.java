package com.chaghor.chaghor.worker.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.time.LocalDate;

// Payload for creating / updating a worker. The last three fields are only used
// on create: if createLogin is true we also create a linked worker login
// account (username + password) so the worker can sign in.
public record WorkerRequest(
        @NotBlank String fullName,
        String nameBn,
        String phone,
        String nationalId,
        LocalDate dob,
        Long zoneId,
        Long supervisorId,
        LocalDate joinDate,
        BigDecimal dailyWage,
        String status,
        String jobRole,
        Boolean createLogin,
        String username,
        String password
) {
}
