package com.chaghor.chaghor.settlement;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// One worker's earnings for one day, after they have been settled.
//
// A SETTLEMENT IS NOT A PAYOUT. No cash leaves the estate here: this records
// that the day's earnings were split between the worker's loan, their advance
// and what they are now owed. Cash leaves through withdrawal_request when the
// worker withdraws.
//
// The (worker_id, work_date) unique constraint in V34 is what makes settling
// idempotent. Re-running for a day already settled fails the constraint and is
// skipped, so a day can never be deducted twice.
@Entity
@Table(name = "daily_settlement")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DailySettlement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "worker_id", nullable = false)
    private Long workerId;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @Column(name = "earned", nullable = false)
    @Builder.Default
    private BigDecimal earned = BigDecimal.ZERO;

    @Column(name = "to_loan", nullable = false)
    @Builder.Default
    private BigDecimal toLoan = BigDecimal.ZERO;

    @Column(name = "to_advance", nullable = false)
    @Builder.Default
    private BigDecimal toAdvance = BigDecimal.ZERO;

    // Repaying an overpayment from a day that was later corrected downward.
    // Fourth in the recovery order, behind the worker's own borrowing.
    @Column(name = "to_overdraw", nullable = false)
    @Builder.Default
    private BigDecimal toOverdraw = BigDecimal.ZERO;

    // What the estate owes the worker for this day once every debt has taken
    // its share. Accrues until the worker withdraws it.
    @Column(name = "payable", nullable = false)
    @Builder.Default
    private BigDecimal payable = BigDecimal.ZERO;

    @Column(name = "settled_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime settledAt;

    // NOT NULL means this row is history: the day was corrected after it was
    // settled, the money it moved has been compensated, and a fresh row for the
    // same day exists alongside it. Never deleted -- see V35.
    @Column(name = "reversed_at")
    private OffsetDateTime reversedAt;

    @Column(name = "reversal_reason")
    private String reversalReason;
}
