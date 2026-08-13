package com.chaghor.chaghor.leaf.dto;

// What came back from "photograph a problem and tell the admin".
//
// Two things happened in one action: the leaf was examined, and a case was
// raised. Both are returned so the supervisor sees the diagnosis AND gets
// confirmation that it actually reached someone -- a report that silently
// failed to file is worse than no report.
public record LeafHealthReportResult(
        LeafHealthReport assessment,
        Long caseId,
        String caseTitle,
        // Null when the case was filed. Populated when the examination worked
        // but filing did not, so the supervisor knows to raise it by hand.
        String reportError) {
}
