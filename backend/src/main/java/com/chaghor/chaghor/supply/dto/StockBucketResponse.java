package com.chaghor.chaghor.supply.dto;

import java.math.BigDecimal;

// One bar of the Warehouse Stock Distribution panel.
public record StockBucketResponse(String stage, String label, BigDecimal weightKg) {
}
