package com.chaghor.chaghor.report;

// Lifecycle of a saved report. A generated report starts as DRAFT (editable /
// deletable) and is locked once FINALIZED. Stored as a plain VARCHAR via
// @Enumerated(STRING), same fresh-table approach as Finance / Inventory / Loans.
public enum ReportStatus {
    DRAFT,
    FINALIZED
}
