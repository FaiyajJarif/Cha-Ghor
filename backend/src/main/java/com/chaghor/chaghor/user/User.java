package com.chaghor.chaghor.user;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 60)
    private String username;

    @Column(unique = true, length = 160)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    // maps the Java enum to the Postgres native enum type
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "role", nullable = false, columnDefinition = "user_role")
    private Role role;

    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "locale", nullable = false, columnDefinition = "locale_code")
    @Builder.Default
    private Locale locale = Locale.en;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean isActive = true;

    // ---- Profile (Settings page) ----
    @Column(name = "display_name", length = 120)
    private String displayName;

    @Column(name = "phone", length = 30)
    private String phone;

    // Has the office accepted this person onto the estate?
    //
    // SEPARATE FROM isActive, which answers a different question: whether the
    // account works right now. An admin suspending a supervisor sets isActive
    // false; that supervisor is still APPROVED and must not reappear in the
    // pending queue. Login requires both.
    //
    // Defaults to approved so anything created by an admin -- who has already
    // made the decision by clicking the button -- is usable immediately.
    @Column(name = "approval_status", nullable = false, length = 16)
    @Builder.Default
    private String approvalStatus = ApprovalStatus.APPROVED;

    @Column(name = "requested_at")
    private OffsetDateTime requestedAt;

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "decided_by")
    private Long decidedBy;

    @Column(name = "rejection_reason")
    private String rejectionReason;

    // ---- worker PIN (V37) ------------------------------------------------
    //
    // BCrypt of the 4 digits, exactly like passwordHash. The PIN itself is
    // never stored: it is shown to the admin once at approval and then exists
    // nowhere readable.
    @Column(name = "pin_hash", length = 100)
    private String pinHash;

    // Unsalted SHA-256, ONLY so the unique index can stop two workers being
    // given the same PIN. BCrypt salts, so its hashes cannot be compared for
    // equality. Never used to authenticate -- see V37.
    @Column(name = "pin_lookup", length = 64)
    private String pinLookup;

    @Column(name = "pin_set_at")
    private OffsetDateTime pinSetAt;

    // Stored as a (possibly base64 data-) URL; TEXT so it isn't length-capped.
    @Column(name = "avatar_url", columnDefinition = "TEXT")
    private String avatarUrl;

    // ---- Per-user notification toggles ----
    @Column(name = "notify_broadcast", nullable = false)
    @Builder.Default
    private boolean notifyBroadcast = true;

    @Column(name = "notify_attendance", nullable = false)
    @Builder.Default
    private boolean notifyAttendance = true;

    @Column(name = "notify_payroll", nullable = false)
    @Builder.Default
    private boolean notifyPayroll = true;

    // DB fills this with now(); we never write it
    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
