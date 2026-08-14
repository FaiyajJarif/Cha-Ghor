package com.chaghor.chaghor.leaf.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

// One point on the collection history chart: how much green leaf was weighed in
// on a given day, and how many weigh-ins made it up.
public record LeafTrendPoint(
        LocalDate date,
        String label,
        long entries,
        BigDecimal totalKg) {
}
