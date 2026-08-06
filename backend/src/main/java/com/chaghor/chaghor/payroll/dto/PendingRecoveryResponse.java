package com.chaghor.chaghor.payroll.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

// GET /payroll/pending-recoveries -- advances that have been paid out but not
// yet netted off a payslip. The admin console shows these as a banner so the
// money is never quietly forgotten.
public record PendingRecoveryResponse(
        long count,
        BigDecimal total,
        List<Item> items) {

    public record Item(
            Long id,
            Long workerId,
            String workerName,
            BigDecimal amount,
            String sourceType,
            Long sourceId,
            String note,
            OffsetDateTime createdAt) {
    }
}
