package com.chaghor.chaghor.vision;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// A model's read of one image (table from V1, wired here for the first time --
// it had no Java at all).
//
// Every suggestion is stored, accepted or not, because the value of this table
// is the record of what the model claimed versus what the supervisor decided.
// Without that you can never tell whether the grader is any good.
@Entity
@Table(name = "vision_inference")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VisionInference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Native Postgres enum `vision_subject` ('leaf_grade','pest') -- lowercase,
    // like every other native enum in this schema.
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "subject_type", nullable = false, columnDefinition = "vision_subject")
    private VisionSubject subjectType;

    @Column(name = "subject_ref", length = 80)
    private String subjectRef;

    @Column(name = "image_url", length = 300)
    private String imageUrl;

    @Column(name = "label", length = 80)
    private String label;

    @Column(name = "confidence", precision = 5, scale = 4)
    private BigDecimal confidence;

    @Column(name = "model", length = 80)
    private String model;

    // ---- health assessment (V26) ----
    // Condition of the leaf, NOT how it was plucked. `label` holds the pluck
    // grade; these hold the diagnosis. They are never mixed, because only the
    // pluck grade pays a bonus.
    @Column(name = "health_score")
    private Integer healthScore;

    @Column(name = "health_band", length = 16)
    private String healthBand;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "candidates_json", columnDefinition = "jsonb")
    private String candidatesJson;

    // Why a photo was refused. A refusal is a correct outcome and is counted
    // separately from predictions, never as a wrong answer.
    @Column(name = "refused_reason", length = 40)
    private String refusedReason;

    // ---- human review: this is the training label ----
    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    @Column(name = "supervisor_verdict", length = 16)
    private String supervisorVerdict;

    @Column(name = "corrected_condition", length = 60)
    private String correctedCondition;

    // The pluck grade the supervisor finally recorded. Native Postgres enum,
    // lowercase-sensitive like every other one in this schema.
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "corrected_grade", columnDefinition = "leaf_grade")
    private com.chaghor.chaghor.leaf.LeafGrade correctedGrade;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
