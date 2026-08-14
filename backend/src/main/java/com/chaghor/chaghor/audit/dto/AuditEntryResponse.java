package com.chaghor.chaghor.audit.dto;

import com.chaghor.chaghor.audit.AuditLog;

// One line of the audit trail, as an admin reads it.
public record AuditEntryResponse(
        Long id,
        String at,
        String actorRole,
        Long actorUserId,
        String action,
        String entityType,
        Long entityId,
        String before,
        String after) {

    public static AuditEntryResponse from(AuditLog a) {
        return new AuditEntryResponse(
                a.getId(),
                a.getAt() == null ? null : a.getAt().toString(),
                a.getActorRole(),
                a.getActorUserId(),
                a.getAction(),
                a.getEntityType(),
                a.getEntityId(),
                a.getBeforeJson(),
                a.getAfterJson());
    }
}
