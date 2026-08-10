package com.chaghor.chaghor.withdrawal;

// What a withdrawal_request row actually is.
//
// Stored as VARCHAR with a CHECK constraint (V33), NOT a native Postgres enum
// -- see the migration for why, and CLAUDE.md section 6.
//
//   salary   wages the worker has ALREADY EARNED, released before payday.
//            Not a debt. Recovered on the payslip only because the money left
//            early; no future day is withheld for it.
//   advance  money against days NOT YET WORKED. A debt. Capped by
//            payroll_config.advance_cap, and repaid by withholding everything
//            the worker earns from the payout date until it is clear.
public enum WithdrawalKind {
    salary,
    advance
}
