package com.chaghor.chaghor.harvest.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// One planned job, with the names already resolved.
//
// zoneName / workerName / supervisorName are filled in the service from
// in-memory maps rather than by JPA relations, matching every other module
// here. The board renders names; it should not have to fetch them.
//
// `overdue` is computed, not stored: a schedule is overdue when its day has
// passed and it is still planned. Storing it would mean a nightly job to keep
// it true, and a stale flag that says work is on time when it is three days
// late is worse than no flag.
public record HarvestScheduleResponse(
        Long id,
        Long zoneId,
        String zoneName,
        LocalDate date,
        String title,
        String description,
        String type,
        BigDecimal expectedKg,
        Long workerId,
        String workerName,
        Long supervisorId,
        String supervisorName,
        String status,
        String attachmentUrl,
        OffsetDateTime createdAt,
        OffsetDateTime completedAt,
        boolean overdue) {
}
