package com.chaghor.chaghor.finance.dto;

import java.math.BigDecimal;
import java.util.List;

// A page of the Money Movement feed plus the running totals shown in its
// footer, so the admin can see cash out vs cash back at a glance.
public record ActivityPageResponse(
        List<ActivityEntryResponse> entries,
        int page,
        int size,
        long total,
        int totalPages,
        BigDecimal totalOut,
        BigDecimal totalIn) {
}
