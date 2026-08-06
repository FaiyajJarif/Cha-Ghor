package com.chaghor.chaghor.payroll;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// Maps to the existing `payroll` table. One row per (worker, period_start,
// period_end) — the UNIQUE constraint lets us upsert a draft when re-generating
// a cycle. FKs stay as plain Long columns, same style as Worker/Attendance.
@Entity
@Table(name = "payroll")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payroll {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "worker_id", nullable = false)
    private Long workerId;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(name = "present_days", nullable = false)
    @Builder.Default
    private Integer presentDays = 0;

    @Column(name = "base_amount", nullable = false)
    @Builder.Default
    private BigDecimal baseAmount = BigDecimal.ZERO;

    @Column(name = "surplus_amount", nullable = false)
    @Builder.Default
    private BigDecimal surplusAmount = BigDecimal.ZERO;

    @Column(name = "grade_bonus", nullable = false)
    @Builder.Default
    private BigDecimal gradeBonus = BigDecimal.ZERO;

    @Column(name = "gross_amount", nullable = false)
    @Builder.Default
    private BigDecimal grossAmount = BigDecimal.ZERO;

    @Column(name = "loan_deduction", nullable = false)
    @Builder.Default
    private BigDecimal loanDeduction = BigDecimal.ZERO;

    @Column(name = "advance_recovery", nullable = false)
    @Builder.Default
    private BigDecimal advanceRecovery = BigDecimal.ZERO;

    @Column(name = "other_deduction", nullable = false)
    @Builder.Default
    private BigDecimal otherDeduction = BigDecimal.ZERO;

    @Column(name = "net_payable", nullable = false)
    @Builder.Default
    private BigDecimal netPayable = BigDecimal.ZERO;

    // maps the Java enum to the Postgres native enum type `payroll_status`
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false, columnDefinition = "payroll_status")
    @Builder.Default
    private PayrollStatus status = PayrollStatus.draft;

    @Column(name = "approved_by")
    private Long approvedBy;

    @Column(name = "paid_at")
    private OffsetDateTime paidAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
