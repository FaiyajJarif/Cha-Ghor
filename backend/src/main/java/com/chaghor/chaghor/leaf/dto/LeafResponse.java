package com.chaghor.chaghor.leaf.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record LeafResponse(
        Long id,
        Long workerId,
        String workerName,
        String zone,
        Long zoneId,
        LocalDate date,
        BigDecimal weightKg,
        String grade,
        // When the weigh-in was actually recorded, so the supervisor screen can
        // show "10:15 AM" against each entry. The column has always existed;
        // it just was not surfaced.
        String recordedAt,

        // The bulk photo, if one was taken. photo_id has existed on
        // leaf_collection since V1 and was finally being written -- but never
        // returned, so the evidence was write-only and no screen could show it.
        // photoUrl is resolved from vision_inference so the client does not
        // need a second round trip per row.
        Long photoId,
        String photoUrl
) {}
