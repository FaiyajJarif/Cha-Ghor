package com.chaghor.chaghor.attendance.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;
import java.util.UUID;

public record AttendanceEntryRequest(
        @NotNull(message = "Each row needs a worker")
        Long workerId,

        @NotBlank(message = "Each row needs a status (present, absent, late or leave)")
        String status,

        // Which field the worker is assigned to FOR THIS DAY.
        //
        // Optional, and null means "use the worker's home zone" -- which is what
        // the service did unconditionally before. Pluckers get moved between
        // fields day to day, and attendance.zone_id has always existed to record
        // that; nothing was ever able to set it to anything but the default.
        Long zoneId,

        // How late, in minutes. Only meaningful with status = late; ignored
        // otherwise so a stale value cannot linger on a row that was corrected
        // to present. Null means "late, by an amount nobody wrote down".
        @Min(value = 0, message = "Lateness cannot be negative")
        @Max(value = 1440, message = "Lateness cannot exceed a full day")
        Integer lateMinutes,

        // ---- offline sync ----------------------------------------------------

        // Stable id generated on the handset BEFORE the write is queued. If the
        // same queued entry is sent twice (flaky rural network, or a service
        // worker retry), the second send is recognised as the same mark rather
        // than treated as a fresh edit.
        UUID clientUuid,

        // When the supervisor actually made this mark. On a phone that has been
        // offline this is hours earlier than the moment the server sees it, and
        // that difference is what resolves conflicts: the server keeps whichever
        // mark is NEWER, so an office correction is not undone by a late replay.
        // Null is treated as "now", which is correct for an online save.
        OffsetDateTime markedAt) {
}
