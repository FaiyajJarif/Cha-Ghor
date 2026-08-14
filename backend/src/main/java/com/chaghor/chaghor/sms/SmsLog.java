package com.chaghor.chaghor.sms;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

// Maps to the existing `sms_log` table (V1). Every outbound message (mock or
// real) is written here so the admin can SEE what would have been sent -- this
// is the audit trail + the demo surface for the mock SMS feature.
@Entity
@Table(name = "sms_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SmsLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "worker_id")
    private Long workerId;

    @Column(name = "phone", length = 20)
    private String phone;

    @Column(name = "message", nullable = false)
    private String message;

    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "category", columnDefinition = "sms_category")
    private SmsCategory category;

    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false, columnDefinition = "sms_status")
    @Builder.Default
    private SmsStatus status = SmsStatus.mock;

    @Column(name = "provider", length = 60)
    private String provider;

    // The broadcast this message came from (V30). Null for payroll and
    // withdrawal notices, which are not broadcasts and never will be.
    //
    // Deliberately a plain Long with no FK: sms_log is an append-only delivery
    // record, and the evidence that a message reached somebody's phone should
    // outlive the case that prompted it.
    @Column(name = "case_id")
    private Long caseId;

    // DB default now(); let Postgres stamp it.
    @Column(name = "sent_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime sentAt;
}
