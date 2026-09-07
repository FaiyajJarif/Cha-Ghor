package com.chaghor.chaghor.worker.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

// What the API returns for a worker. Includes resolved zone / supervisor / login
// names so the frontend table can render without extra lookups.
public record WorkerResponse(
        Long id,
        String fullName,
        String nameBn,
        String phone,
        String nationalId,
        LocalDate dob,
        Long zoneId,
        String zoneName,
        Long supervisorId,
        String supervisorName,
        LocalDate joinDate,
        BigDecimal dailyWage,
        String status,
        String jobRole,
        String photoUrl,
        Long userId,
        String username
) {
}
