package com.chaghor.chaghor.attendance;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

// Maps to the existing `attendance` table. One row per (worker, work_date):
// the UNIQUE(worker_id, work_date) constraint means we upsert rather than
// insert duplicates. FKs are kept as plain Long columns (same style as Worker).
@Entity
@Table(name = "attendance")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Attendance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "worker_id", nullable = false)
    private Long workerId;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    // maps the Java enum to the Postgres native enum type `attendance_status`
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false, columnDefinition = "attendance_status")
    private AttendanceStatus status;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "marked_by")
    private Long markedBy;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;

    // How late, in minutes (V24). Only meaningful when status = late.
    // NULL on a late row means "late, amount not recorded" -- which is not the
    // same fact as 0, so it is left null rather than defaulted.
    @Column(name = "late_minutes")
    private Integer lateMinutes;

    // When the supervisor made this mark, NOT when it reached the server (V24).
    // On a handset that was offline these differ by hours, and the gap is what
    // decides a conflict: the newer mark wins, so a midday correction is not
    // undone by an evening replay carrying a stale morning mark.
    @Column(name = "marked_at")
    private OffsetDateTime markedAt;

    // Idempotency key for offline replays (column added in V18, mapped here for
    // the first time). A partial unique index enforces one row per key, so a
    // handset that sends the same queued write twice cannot create two rows.
    @Column(name = "client_uuid")
    private UUID clientUuid;
}
