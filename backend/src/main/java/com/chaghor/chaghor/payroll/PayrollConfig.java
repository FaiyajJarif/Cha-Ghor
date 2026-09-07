package com.chaghor.chaghor.payroll;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

// Maps to the existing `payroll_config` table. Holds the rate knobs that drive
// the wage formula. We keep the latest row (highest effective_from) as "current".
@Entity
@Table(name = "payroll_config")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PayrollConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "base_daily_wage", nullable = false)
    @Builder.Default
    private BigDecimal baseDailyWage = new BigDecimal("170.00");

    @Column(name = "leaf_quota_kg", nullable = false)
    @Builder.Default
    private BigDecimal leafQuotaKg = new BigDecimal("23.00");

    @Column(name = "surplus_rate", nullable = false)
    @Builder.Default
    private BigDecimal surplusRate = new BigDecimal("5.00");

    @Column(name = "grade_bonus_rate", nullable = false)
    @Builder.Default
    private BigDecimal gradeBonusRate = new BigDecimal("1.00");

    // ---- borrowing limits (V32) --------------------------------------------
    // Most a worker may OWE at once, not most they may request. The guard is
    // `outstanding + requested <= cap`, so someone holding ৳300 can draw ৳200.

    // অগ্রিম: recovered by withholding ALL daily earnings until clear, so this
    // is also how many days the worker will be paid nothing.
    @Column(name = "advance_cap", nullable = false)
    @Builder.Default
    private BigDecimal advanceCap = new BigDecimal("500.00");

    // ঋণ: recovered a fixed amount per day, so the worker keeps the remainder.
    @Column(name = "loan_cap", nullable = false)
    @Builder.Default
    private BigDecimal loanCap = new BigDecimal("2000.00");

    @Column(name = "loan_daily_deduction", nullable = false)
    @Builder.Default
    private BigDecimal loanDailyDeduction = new BigDecimal("20.00");

    @Column(name = "effective_from", nullable = false)
    @Builder.Default
    private LocalDate effectiveFrom = LocalDate.now();

    @Column(name = "updated_by")
    private Long updatedBy;
}
