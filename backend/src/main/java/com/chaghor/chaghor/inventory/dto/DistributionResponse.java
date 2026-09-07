package com.chaghor.chaghor.inventory.dto;

import java.util.List;

// `sites` is the distinct-site count shown in the middle of the donut.
public record DistributionResponse(
        int sites,
        List<DistributionSlice> slices
) {}
