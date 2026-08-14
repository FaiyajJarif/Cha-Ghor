package com.chaghor.chaghor.leaf.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

// Payload for POST /api/v1/leaf: record one worker's green-leaf pluck.
// `date` defaults to today when omitted. `grade` is optional ("A"|"B"|"C").
public record LeafRecordRequest(
        @NotNull(message = "workerId is required") Long workerId,
        LocalDate date,
        @NotNull(message = "weightKg is required")
        @PositiveOrZero(message = "weightKg cannot be negative") BigDecimal weightKg,
        String grade,

        // Which field the leaf actually came from. Optional: null keeps the old
        // behaviour of using the worker's home zone. Pluckers get moved between
        // fields, and leaf_collection.zone_id has always existed to record where
        // the crop came from -- nothing could set it to anything else before.
        Long zoneId,

        // Generated on the handset before the write is queued. If the same
        // queued weigh-in is sent twice, the second is recognised as the same
        // one instead of adding the kilos again -- which would overpay the
        // worker, since surplus is computed straight off this weight.
        java.util.UUID clientUuid,

        // The vision_inference row holding the photo of this worker's bulk.
        // leaf_collection.photo_id has existed since V1 and nothing ever set
        // it; this is the evidence that the leaf was actually handed in.
        Long photoId
) {}
