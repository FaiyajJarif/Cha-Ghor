package com.chaghor.chaghor.finance.dto;

import com.chaghor.chaghor.finance.FinanceEntry;

import java.math.BigDecimal;
import java.time.LocalDate;

// One row in the General Ledger table. category/status are the enum names
// (REVENUE/EXPENSE/PAYROLL/LOAN, SETTLED/PENDING); the frontend styles them.
public record LedgerEntryResponse(
        Long id,
        LocalDate date,
        String refId,
        String category,
        String account,
        BigDecimal amount,
        String status) {

    public static LedgerEntryResponse from(FinanceEntry e) {
        return new LedgerEntryResponse(
                e.getId(),
                e.getEntryDate(),
                e.getRefId(),
                e.getCategory() == null ? null : e.getCategory().name(),
                e.getAccount(),
                e.getAmount(),
                e.getStatus() == null ? null : e.getStatus().name());
    }
}
