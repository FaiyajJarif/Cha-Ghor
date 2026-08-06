package com.chaghor.chaghor.inventory.dto;

import java.time.OffsetDateTime;

public record RequisitionResponse(
        Long id,
        String itemLabel,
        String requester,
        String detail,
        String status,
        OffsetDateTime requestedAt,
        OffsetDateTime decidedAt
) {}
