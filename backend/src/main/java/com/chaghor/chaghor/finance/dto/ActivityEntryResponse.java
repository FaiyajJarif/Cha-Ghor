package com.chaghor.chaghor.finance.dto;

import com.chaghor.chaghor.finance.FinanceEntry;

import java.math.BigDecimal;
import java.time.LocalDate;

// One row in the "Money Movement" feed on the Finance page: the auto-posted
// ledger lines only (payroll paid, worker withdrawal, loan disbursed, loan
// repaid). Manual entries are excluded -- those already have the General Ledger.
//
// `direction` is IN, OUT or NEUTRAL. Every amount stored in finance_ledger is
// positive (V14 adds CHECK (amount >= 0)), so direction is derived from
// source_type rather than from the sign, and the UI colours the row from it.
//
// NEUTRAL exists for one case: a loan repayment that was deducted from wages
// rather than handed over in cash. No money moved for it -- the estate just
// paid a smaller wage, and the PAYROLL row already shows that reduced amount.
// Showing it as "+" would credit the same taka twice, which is exactly the
// double-count cashOnHand had. It stays in the feed (the loan balance really
// did move) but it is neither cash in nor cash out.
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
        return from(e, false);
    }

    // wageDeducted: this row is a loan_in whose repayment carries a payroll_id,
    // i.e. it was recovered out of a payslip instead of paid in cash.
    public static ActivityEntryResponse from(FinanceEntry e, boolean wageDeducted) {
        String src = e.getSourceType() == null ? "" : e.getSourceType();
        return new ActivityEntryResponse(
                e.getId(),
                e.getEntryDate(),
                e.getRefId(),
                kindOf(src, wageDeducted),
                directionOf(src, wageDeducted),
                e.getAccount(),
                e.getAmount(),
                e.getNote());
    }

    private static String kindOf(String src, boolean wageDeducted) {
        return switch (src) {
            case "payroll" -> "PAYROLL";
            case "withdrawal" -> "WITHDRAWAL";
            case "loan_out" -> "LOAN_OUT";
            case "loan_in" -> wageDeducted ? "LOAN_IN_WAGE" : "LOAN_IN";
            default -> "OTHER";
        };
    }

    private static String directionOf(String src, boolean wageDeducted) {
        if (!"loan_in".equals(src)) {
            return "OUT";
        }
        // Cash repayment brings money in; a wage deduction moves no cash at all.
        return wageDeducted ? "NEUTRAL" : "IN";
    }
}
