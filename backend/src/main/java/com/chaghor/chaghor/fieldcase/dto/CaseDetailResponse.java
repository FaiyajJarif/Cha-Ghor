package com.chaghor.chaghor.fieldcase.dto;

import com.chaghor.chaghor.fieldcase.FieldCase;

import java.util.List;

// The right-hand detail panel: the full case plus its reply thread.
public record CaseDetailResponse(
        Long id,
        String caseType,
        String category,
        String title,
        String body,
        String submitterName,
        String submitterRole,
        String workerCode,
        String zone,
        String priority,
        String status,
        String evidenceUrl,
        String createdAt,
        String firstResponseAt,
        String resolvedAt,
        List<CaseReplyResponse> replies
) {
    public static CaseDetailResponse from(FieldCase c, List<CaseReplyResponse> replies) {
        return new CaseDetailResponse(
                c.getId(),
                c.getCaseType().name(),
                c.getCategory(),
                c.getTitle(),
                c.getBody(),
                c.getSubmitterName(),
                c.getSubmitterRole(),
                c.getWorkerCode(),
                c.getZone(),
                c.getPriority().name(),
                c.getStatus().name(),
                c.getEvidenceUrl(),
                c.getCreatedAt() == null ? null : c.getCreatedAt().toString(),
                c.getFirstResponseAt() == null ? null : c.getFirstResponseAt().toString(),
                c.getResolvedAt() == null ? null : c.getResolvedAt().toString(),
                replies
        );
    }
}
