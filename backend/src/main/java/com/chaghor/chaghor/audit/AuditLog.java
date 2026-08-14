package com.chaghor.chaghor.audit;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

// Append-only audit row (maps to the `audit_log` table from V15).
// The application role has INSERT + SELECT only on this table, so rows can
// never be updated or deleted through the app.
@Entity
@Table(name = "audit_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "actor_user_id")
    private Long actorUserId;

    @Column(name = "actor_role", length = 20)
    private String actorRole;

    @Column(name = "action", nullable = false, length = 20)
    private String action;

    @Column(name = "entity_type", nullable = false, length = 60)
    private String entityType;

    @Column(name = "entity_id")
    private Long entityId;

    // Stored as jsonb. Keep the Java side as String and let Hibernate map JSON.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "before_json", columnDefinition = "jsonb")
    private String beforeJson;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "after_json", columnDefinition = "jsonb")
    private String afterJson;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime at;
}
