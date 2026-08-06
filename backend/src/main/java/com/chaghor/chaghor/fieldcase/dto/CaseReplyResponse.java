package com.chaghor.chaghor.fieldcase.dto;

import com.chaghor.chaghor.fieldcase.CaseReply;

public record CaseReplyResponse(
        Long id,
        String authorName,
        String authorRole,
        String body,
        String createdAt
) {
    public static CaseReplyResponse from(CaseReply r) {
        return new CaseReplyResponse(
                r.getId(),
                r.getAuthorName(),
                r.getAuthorRole(),
                r.getBody(),
                r.getCreatedAt() == null ? null : r.getCreatedAt().toString()
        );
    }
}
