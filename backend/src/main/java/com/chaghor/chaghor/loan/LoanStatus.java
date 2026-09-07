package com.chaghor.chaghor.loan;

// Lifecycle of a worker loan / advance, aligned with the pipeline stepper:
// REQUESTED / ADMIN REVIEW -> PENDING; APPROVED + DEDUCTING -> ACTIVE (or
// OVERDUE when behind); REPAID once fully recovered; REJECTED if declined.
public enum LoanStatus {
    PENDING,
    ACTIVE,
    OVERDUE,
    REPAID,
    REJECTED
}
