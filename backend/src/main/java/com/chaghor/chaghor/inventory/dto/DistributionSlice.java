package com.chaghor.chaghor.inventory.dto;

// One site in the Distribution donut.
public record DistributionSlice(
        String label,
        long count,
        int percent
) {}
