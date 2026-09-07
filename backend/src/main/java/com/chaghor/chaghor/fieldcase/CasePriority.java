package com.chaghor.chaghor.fieldcase;

// How urgent a case is. Feeds the "Compliance Status" KPI: an active case that
// breaches its priority response window (URGENT 8h, HIGH 24h, MEDIUM 72h,
// LOW 168h) pushes the estate to "at-risk".
public enum CasePriority {
    LOW,
    MEDIUM,
    HIGH,
    URGENT
}
