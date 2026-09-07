package com.chaghor.chaghor.loan.dto;

import java.util.List;

public record RepaymentPageResponse(
        List<RepaymentResponse> items,
        int page,
        int size,
        long total,
        int totalPages
) {}
