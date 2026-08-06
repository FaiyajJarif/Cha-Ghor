package com.chaghor.chaghor.attendance;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;

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
}
