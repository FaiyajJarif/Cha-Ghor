package com.chaghor.chaghor.bkash;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One wallet in a payout run.
//
// withdrawal_id is UNIQUE in the schema, so the same request cannot land in two
// batches and be paid twice. The database refuses rather than trusting the UI.
@Entity
@Table(name = "disbursement_item")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DisbursementItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "batch_id", nullable = false)
    private Long batchId;

    @Column(name = "withdrawal_id", nullable = false)
    private Long withdrawalId;

    @Column(name = "worker_id", nullable = false)
    private Long workerId;

    @Column(name = "phone", nullable = false, length = 20)
    private String phone;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 16)
    private String status = "queued";

    // The bKash transaction id. This is what turns "the office says it paid"
    // into something reconcilable against a bKash statement.
    @Column(name = "trx_id", length = 40)
    private String trxId;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;
}
