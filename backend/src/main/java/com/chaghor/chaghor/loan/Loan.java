package com.chaghor.chaghor.loan;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One worker loan / advance. A row starts life as a PENDING request (worker
// profile + requested amount + reason). When an admin approves it, a reference
// is minted and it moves to ACTIVE, then is repaid down via daily wage
// deductions until REPAID. Repayment progress (repaid / principal) is derived
// in the service, never stored. Mirrors the Inventory module's fresh-table +
// VARCHAR enum approach (@Enumerated(STRING)).
@Entity
@Table(name = "loan")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Loan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Links this loan to workers(id). Added in Phase 0 (V14: loan.worker_id +
    // FK RESTRICT, existing rows backfilled by name). Resolved from workerName
    // on create when a matching worker exists; may be null for unmatched names.
    @Column(name = "worker_id")
    private Long workerId;

    // Minted on approval, e.g. "L-2026-007". Null while still PENDING.
    @Column(name = "reference", length = 40)
    private String reference;

    @Column(name = "worker_name", nullable = false, length = 120)
    private String workerName;

    // Estate zone label shown under the worker name, e.g. "A1".
    @Column(name = "zone", length = 20)
    private String zone;

    // Optional avatar URL; the UI falls back to initials when null.
    @Column(name = "avatar_url", columnDefinition = "TEXT")
    private String avatarUrl;

    // Requested / approved principal.
    @Column(name = "principal", nullable = false)
    @Builder.Default
    private BigDecimal principal = BigDecimal.ZERO;

    // Free-text primary reason, e.g. "Medical Emergency (Hospitalization)".
    @Column(name = "reason", length = 200)
    private String reason;

    // Amount recovered so far via wage deductions.
    @Column(name = "repaid", nullable = false)
    @Builder.Default
    private BigDecimal repaid = BigDecimal.ZERO;

    // Daily wage deduction applied while ACTIVE.
    @Column(name = "daily_deduction", nullable = false)
    @Builder.Default
    private BigDecimal dailyDeduction = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private LoanStatus status = LoanStatus.PENDING;

    @Column(name = "requested_at", nullable = false)
    @Builder.Default
    private OffsetDateTime requestedAt = OffsetDateTime.now();

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "decided_by")
    private Long decidedBy;
}
