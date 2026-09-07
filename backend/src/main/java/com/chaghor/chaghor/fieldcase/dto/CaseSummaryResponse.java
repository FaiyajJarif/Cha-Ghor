package com.chaghor.chaghor.fieldcase.dto;

// The four KPI cards on the Reports & Complaints screen.
// - avgResponseHours: mean hours from submission to first admin reply.
// - activeCount: OPEN + IN_PROGRESS cases.
// - resolutionRate: resolved / total, as a 0-100 percentage.
// - complianceStatus: "stable" or "at-risk" (any active case past its SLA).
public record CaseSummaryResponse(
        double avgResponseHours,
        long activeCount,
        double resolutionRate,
        String complianceStatus,
        long totalCount,
        long resolvedCount
) {}
