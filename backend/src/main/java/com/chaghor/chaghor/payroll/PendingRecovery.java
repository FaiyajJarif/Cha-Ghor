package com.chaghor.chaghor.payroll;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// A wage advance that could not be recovered from a payslip at the moment it
// was paid out (V20).
//
// Why this exists: in v9 a paid withdrawal tried to add itself to
// advance_recovery on the worker's current-period payslip. If that payslip had
// not been generated yet, or had already been Approved/Paid, the recovery was
// dropped on the floor while the cash had genuinely left the estate. Parking it
// here means the money is always recovered eventually -- the next payslip
// generation drains every open row for that worker.
@Entity
@Table(name = "payroll_pending_recovery")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PendingRecovery {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "worker_id", nullable = false)
    private Long workerId;

    @Column(name = "amount", nullable = false)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;

    // "withdrawal" today; kept generic so other advance types can reuse it.
    @Column(name = "source_type", nullable = false, length = 20)
    private String sourceType;

    @Column(name = "source_id")
    private Long sourceId;

    @Column(name = "note")
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;

    // NULL while still owed. Stamped when a payslip absorbs it.
    @Column(name = "applied_at")
    private OffsetDateTime appliedAt;

    @Column(name = "payroll_id")
    private Long payrollId;
}
