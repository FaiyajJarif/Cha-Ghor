package com.chaghor.chaghor.settlement;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// Money a worker was paid for a day that later turned out to be worth less.
//
// A day settles at ৳215, the worker withdraws it, and the next morning the
// weigh-in is corrected to ৳150. The ৳65 is already in his bKash.
//
// NOTHING IS CLAWED BACK. No cash is demanded from a tea plucker because an
// office record changed -- that is the kind of thing that makes a worker
// distrust the whole system, and the mistake was not his. The ৳65 is carried
// here and worked off from future earnings, the same way an advance is.
//
// Kept separate from advances deliberately. An advance is something the worker
// asked for; an overdraw is something the estate got wrong. Folding one into
// the other would hide the estate's own error rate inside the workers'
// borrowing figures, and would quietly consume the ৳500 advance cap with debt
// the worker never chose to take on.
@Entity
@Table(name = "wage_overdraw")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WageOverdraw {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "worker_id", nullable = false)
    private Long workerId;

    @Column(name = "amount", nullable = false)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;

    @Column(name = "recovered", nullable = false)
    @Builder.Default
    private BigDecimal recovered = BigDecimal.ZERO;

    // The day whose correction caused this, so the worker's screen can say
    // which day changed rather than showing an unexplained deduction.
    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @Column(name = "settlement_id")
    private Long settlementId;

    @Column(name = "reason")
    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
