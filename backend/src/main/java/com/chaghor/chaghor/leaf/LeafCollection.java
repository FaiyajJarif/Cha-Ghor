package com.chaghor.chaghor.leaf;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// Maps to the existing `leaf_collection` table (created in V1). One row per
// recorded pluck: how much green leaf a worker brought in on a given day, in
// which zone, and (optionally) a quality grade. Quality grading by AI is a
// demo-tier feature, so `qualityGrade` and `photoId` stay optional/nullable and
// are only set when provided manually. FKs are plain Long columns, same style
// as Attendance / Worker.
@Entity
@Table(name = "leaf_collection")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LeafCollection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "worker_id", nullable = false)
    private Long workerId;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "collect_date", nullable = false)
    private LocalDate collectDate;

    @Column(name = "weight_kg", nullable = false)
    @Builder.Default
    private BigDecimal weightKg = BigDecimal.ZERO;

    // Native Postgres enum `leaf_grade` ('A','B','C'). Nullable: grading is a
    // demo-tier AI feature and is often left unset.
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "quality_grade", columnDefinition = "leaf_grade")
    private LeafGrade qualityGrade;

    // References vision_inference(id). Left null unless the demo grading flow set it.
    @Column(name = "photo_id")
    private Long photoId;

    @Column(name = "recorded_by")
    private Long recordedBy;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;

    // Idempotency key for offline replays (column + partial unique index added
    // in V18, mapped here for the first time).
    //
    // This matters more here than on attendance. Attendance has
    // UNIQUE(worker_id, work_date), so a replayed save can only ever overwrite.
    // Leaf has NO natural unique key -- a plucker legitimately weighs in
    // several times a day -- so a replayed POST would insert a SECOND row and
    // double-count the kilos. Those kilos feed the payroll surplus, so the
    // duplicate would quietly overpay someone.
    @Column(name = "client_uuid")
    private java.util.UUID clientUuid;
}
