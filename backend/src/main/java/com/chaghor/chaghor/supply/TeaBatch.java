package com.chaghor.chaghor.supply;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// A processed tea batch held in the warehouse. Backs the Warehouse Stock
// Distribution bars (grouped by stage) and the Dispatch Readiness quality gate
// (readiness = PASSED / PENDING). qualityPct is nullable while lab results are
// pending.
@Entity
@Table(name = "tea_batch")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TeaBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "batch_code", nullable = false, length = 40)
    @Builder.Default
    private String batchCode = "";

    @Column(name = "grade", nullable = false, length = 40)
    @Builder.Default
    private String grade = "";

    @Column(name = "quality_pct", precision = 5, scale = 2)
    private BigDecimal qualityPct;

    @Column(name = "quality_note", length = 80)
    private String qualityNote;

    @Enumerated(EnumType.STRING)
    @Column(name = "stage", nullable = false, length = 30)
    @Builder.Default
    private BatchStage stage = BatchStage.PROCESSING;

    @Column(name = "weight_kg", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal weightKg = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "readiness", nullable = false, length = 20)
    @Builder.Default
    private ReadinessStatus readiness = ReadinessStatus.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
