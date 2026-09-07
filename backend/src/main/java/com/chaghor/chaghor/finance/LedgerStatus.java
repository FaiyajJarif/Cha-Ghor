package com.chaghor.chaghor.finance;

// Settlement state of a ledger line. PENDING lines carry a due_date and feed the
// "Payables due" and "Overdue" KPI cards.
public enum LedgerStatus {
    SETTLED,
    PENDING
}
