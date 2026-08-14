package com.chaghor.chaghor.finance.dto;

import java.util.List;

// A page of ledger rows plus paging metadata for the table footer
// ("Showing X-Y of N transactions").
public record LedgerPageResponse(
        List<LedgerEntryResponse> entries,
        int page,
        int size,
        long total,
        int totalPages) {
}
