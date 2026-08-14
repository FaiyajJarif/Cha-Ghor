package com.chaghor.chaghor.inventory.dto;

import java.util.List;

public record ItemPageResponse(
        List<ItemResponse> items,
        int page,
        int size,
        long total,
        int totalPages
) {}
