package com.chaghor.chaghor.loan;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// The AI's credit assessment of one loan request, kept as an audit record: what
// was suggested, on what evidence, by which model, at approval time.
//
// It is NOT a training signal -- nothing learns from these rows. Scoring
// accuracy comes from the worker's real repayment outcomes in `loan` and
// `loan_repayment_entry`, which are re-read on every scoring run. This table
// answers a different question: "what did the AI say on the day we decided?"
//
// loan_id is UNIQUE (V1), so re-scoring a request overwrites the previous
// assessment rather than accumulating rows. The foreign key was repointed from
// the dead `loans` table to the live `loan` table in V21.
@Entity
@Table(name = "loan_ai_assessment")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoanAiAssessment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "loan_id", nullable = false, unique = true)
    private Long loanId;

    // Native Postgres enum `risk_level`: lowercase low | med | high.
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "risk_level", nullable = false, columnDefinition = "risk_level")
    @Builder.Default
    private RiskLevel riskLevel = RiskLevel.med;

    // Set when the AI thinks the requested amount is more than the worker can
    // carry. Null means "the amount as requested is fine".
    @Column(name = "suggested_amount")
    private BigDecimal suggestedAmount;

    @Column(name = "reason_en", columnDefinition = "TEXT")
    private String reasonEn;

    @Column(name = "reason_bn", columnDefinition = "TEXT")
    private String reasonBn;

    @Column(name = "model", length = 80)
    private String model;

    // The exact facts the score was based on, stored as JSON text so an
    // assessment can be re-read later without guessing what it saw.
    @Column(name = "features_json", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String featuresJson;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
