package com.chaghor.chaghor.fieldcase;

// Lifecycle of a case. OPEN (just submitted) -> IN_PROGRESS (admin has replied /
// is working it) -> RESOLVED (issue solved). REJECTED closes an invalid or
// duplicate case. "Active" KPIs count OPEN + IN_PROGRESS.
public enum CaseStatus {
    OPEN,
    IN_PROGRESS,
    RESOLVED,
    REJECTED
}
