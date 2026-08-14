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
    // CONFIDENTIAL CASES ARE STRIPPED HERE, IN THE MAPPER.
    //
    // Not in a service, not in a controller, not in the UI -- here, at the one
    // place a FieldCase becomes something the outside world can see. Every
    // caller goes through this method, so there is no path that can forget.
    //
    // A grievance channel is worth exactly as much as its weakest leak. The
    // worker this is for is one raising a complaint about their own supervisor;
    // if their name surfaces once, in one list, on one screen, nobody on that
    // estate uses the feature again. Putting the check anywhere a future change
    // could route around would be the wrong kind of convenient.
    //
    // `submittedBy` is still stored on the row -- see FieldCase.confidential for
    // why an estate needs that -- it simply never leaves the building.
    public static CaseListItemResponse from(FieldCase c) {
        String body = c.getBody() == null ? "" : c.getBody();
        String preview = body.length() > 140 ? body.substring(0, 140) + "\u2026" : body;
        boolean hide = c.isConfidential();
        return new CaseListItemResponse(
                c.getId(),
                c.getCaseType().name(),
                c.getCategory(),
                c.getTitle(),
                preview,
                hide ? "\u0997\u09cb\u09aa\u09a8\u09c0\u09af\u09bc \u0985\u09ad\u09bf\u09af\u09cb\u0997" : c.getSubmitterName(),
                hide ? null : c.getSubmitterRole(),
                // The worker code identifies a person as surely as their name.
                hide ? null : c.getWorkerCode(),
                // The zone narrows it to a handful of people on a small estate.
                hide ? null : c.getZone(),
                c.getPriority().name(),
                c.getStatus().name(),
                c.getCreatedAt() == null ? null : c.getCreatedAt().toString()
        );
    }
}
