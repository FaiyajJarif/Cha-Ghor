package com.chaghor.chaghor.finance;

// How a ledger line is classified. Stored as plain text on finance_ledger (see
// FinanceEntry) so this fresh table needs no native Postgres enum type.
public enum LedgerCategory {
    REVENUE,
    EXPENSE,
    PAYROLL,
    LOAN
}
