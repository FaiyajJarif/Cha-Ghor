package com.chaghor.chaghor.bkash;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One bulk payout run — the spreadsheet a corporate bKash arrangement is fed.
//
// draft  built from pending withdrawals, exportable as CSV, nothing paid
// sent   executed: the wallet was debited and every withdrawal marked paid
//
// VARCHAR + CHECK for the status, not a native Postgres enum (CLAUDE.md §6).
@Entity
@Table(name = "disbursement_batch")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DisbursementBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "reference", nullable = false, length = 40)
    private String reference;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 16)
    private String status = "draft";

    @Builder.Default
    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Builder.Default
    @Column(name = "item_count", nullable = false)
    private Integer itemCount = 0;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;
}
