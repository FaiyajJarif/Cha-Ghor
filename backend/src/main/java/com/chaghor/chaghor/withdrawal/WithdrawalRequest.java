package com.chaghor.chaghor.withdrawal;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// Maps to the existing `withdrawal_request` table (V1). A worker asks to cash
// out earned wages; an admin marks it paid or rejected. Payout is a MOCK (bKash
// is demo-only), so there is no real payment gateway here -- deciding a request
// just flips status + stamps processed_at. Phase 3 will fire a (mock) SMS when
// the status changes.
@Entity
@Table(name = "withdrawal_request")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WithdrawalRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "worker_id", nullable = false)
    private Long workerId;

    @Column(name = "amount", nullable = false)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;

    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "method", nullable = false, columnDefinition = "withdrawal_method")
    @Builder.Default
    private WithdrawalMethod method = WithdrawalMethod.bkash;

    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false, columnDefinition = "withdrawal_status")
    @Builder.Default
    private WithdrawalStatus status = WithdrawalStatus.pending;

    // salary or advance. The difference decides whether future earnings are
    // withheld, and it is the reason V33 exists.
    //
    // NOTE THE MAPPING: plain @Enumerated(STRING) against a VARCHAR column,
    // NOT the @JdbcTypeCode(NAMED_ENUM) used by `method` and `status` above.
    // Those two are native Postgres enums from V1; `kind` is VARCHAR + CHECK,
    // which is what new schema uses (V23). Copying the NAMED_ENUM annotation
    // here would make Hibernate look for a `withdrawal_kind` Postgres type that
    // does not exist, and the application would fail to start.
    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 16)
    @Builder.Default
    private WithdrawalKind kind = WithdrawalKind.advance;

    // DB default now(); let Postgres stamp it on insert.
    @Column(name = "requested_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime requestedAt;

    @Column(name = "processed_at")
    private OffsetDateTime processedAt;
}
