package com.chaghor.chaghor.supply.dto;

import java.math.BigDecimal;

// The six KPI cards on the Supply Chain Overview.
public record SupplySummaryResponse(
        BigDecimal teaInStockKg,
        BigDecimal inTransitKg,
        BigDecimal deliveredKg,
        BigDecimal volumeSoldKg,
        long activeShipments,
        long pendingOrders) {
}
