package com.chaghor.chaghor.fieldcase.dto;

import com.chaghor.chaghor.fieldcase.FieldCase;

// A row in the left-hand case list. Body is trimmed to a short preview.
public record CaseListItemResponse(
        Long id,
        String caseType,
        String category,
        String title,
        String preview,
        String submitterName,
        String submitterRole,
        String workerCode,
        String zone,
        String priority,
        String status,
        String createdAt
) {
    public static CaseListItemResponse from(FieldCase c) {
        String body = c.getBody() == null ? "" : c.getBody();
        String preview = body.length() > 140 ? body.substring(0, 140) + "\u2026" : body;
        return new CaseListItemResponse(
                c.getId(),
                c.getCaseType().name(),
                c.getCategory(),
                c.getTitle(),
                preview,
                c.getSubmitterName(),
                c.getSubmitterRole(),
                c.getWorkerCode(),
                c.getZone(),
                c.getPriority().name(),
                c.getStatus().name(),
                c.getCreatedAt() == null ? null : c.getCreatedAt().toString()
        );
    }
}
