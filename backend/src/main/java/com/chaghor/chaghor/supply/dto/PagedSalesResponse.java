package com.chaghor.chaghor.supply.dto;

import java.util.List;

// A page of the sales ledger for the "SHOWING X OF Y" paginated table.
public record PagedSalesResponse(
        List<SalesTxnResponse> items,
        int page,
        int size,
        long total,
        int totalPages) {
}
