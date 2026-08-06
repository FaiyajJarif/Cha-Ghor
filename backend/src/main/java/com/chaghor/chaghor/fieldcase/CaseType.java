package com.chaghor.chaghor.fieldcase;

// What kind of item this is. COMPLAINT = a grievance raised by a worker (e.g.
// wage delay); REPORT = an operational / maintenance field report raised by a
// supervisor (e.g. broken tractor). Drives the All / Complaints / Reports tabs
// on the Reports & Complaints screen. Stored as VARCHAR via @Enumerated(STRING)
// -- fresh table, no native Postgres enum.
public enum CaseType {
    COMPLAINT,
    REPORT
}
