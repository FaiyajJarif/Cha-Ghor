package com.chaghor.chaghor.fieldcase.dto;

// Payload to submit a new complaint or field report. The submitter identity is
// resolved from the authenticated principal, not from this body.
public record CreateCaseRequest(
        String caseType,
        String category,
        String title,
        String body,
        String workerCode,
        String zone,
        String priority,
        String evidenceUrl
) {}
