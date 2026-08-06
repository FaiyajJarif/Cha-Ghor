package com.chaghor.chaghor.inventory.dto;

import java.math.BigDecimal;

// The six KPI cards at the top of the Inventory screen.
public record InventorySummaryResponse(
        long totalItems,      // sum of on-hand quantity across all items
        long itemsDelta,      // items added in the last 30 days ("+N" pill)
        BigDecimal stockValue, // sum of quantity * unitValue
        int lowStock,         // items between critical and healthy
        int critical,         // items at/near stock-out
        long pendingReq,      // requisitions awaiting a decision
        long approvedToday    // requisitions approved since midnight
) {}
