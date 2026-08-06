package com.chaghor.chaghor.finance.dto;

import com.chaghor.chaghor.finance.FinanceEntry;

import java.math.BigDecimal;
import java.time.LocalDate;

// One row in the "Money Movement" feed on the Finance page: the auto-posted
// ledger lines only (payroll paid, worker withdrawal, loan disbursed, loan
// repaid). Manual entries are excluded -- those already have the General Ledger.
//
// `direction` is IN or OUT. Every amount stored in finance_ledger is positive
// (V14 adds CHECK (amount >= 0)), so direction is derived from source_type
// rather than from the sign, and the UI colours the row from it.
public record ActivityEntryResponse(
        Long id,
        LocalDate date,
        String refId,
        String kind,
        String direction,
        String account,
        BigDecimal amount,
        String note) {

    public static ActivityEntryResponse from(FinanceEntry e) {
        String src = e.getSourceType() == null ? "" : e.getSourceType();
        return new ActivityEntryResponse(
                e.getId(),
                e.getEntryDate(),
                e.getRefId(),
                kindOf(src),
                directionOf(src),
                e.getAccount(),
                e.getAmount(),
                e.getNote());
    }

    private static String kindOf(String src) {
        return switch (src) {
            case "payroll" -> "PAYROLL";
            case "withdrawal" -> "WITHDRAWAL";
            case "loan_out" -> "LOAN_OUT";
            case "loan_in" -> "LOAN_IN";
            default -> "OTHER";
        };
    }

    private static String directionOf(String src) {
        // loan_in is the only inflow in this feed: capital coming back to the estate.
        return "loan_in".equals(src) ? "IN" : "OUT";
    }
}
