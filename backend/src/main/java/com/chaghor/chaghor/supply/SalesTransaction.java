package com.chaghor.chaghor.supply;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// One row of the Sales Transaction Ledger. netRevenue is stored explicitly
// (volume x rate at sale time) so historical rows stay correct even if rates
// later change. Money columns are NUMERIC(14,2), matching the finance ledger.
@Entity
@Table(name = "sales_transaction")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SalesTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "trx_id", nullable = false, length = 40)
    @Builder.Default
    private String trxId = "";

    @Column(name = "txn_date", nullable = false)
    @Builder.Default
    private LocalDate txnDate = LocalDate.now();

    @Column(name = "grade", nullable = false, length = 40)
    @Builder.Default
    private String grade = "";

    @Column(name = "batch_code", length = 40)
    private String batchCode;

    @Column(name = "buyer", nullable = false, length = 120)
    @Builder.Default
    private String buyer = "";

    @Column(name = "volume_kg", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal volumeKg = BigDecimal.ZERO;

    @Column(name = "rate_per_kg", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal ratePerKg = BigDecimal.ZERO;

    @Column(name = "net_revenue", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal netRevenue = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "pay_status", nullable = false, length = 20)
    @Builder.Default
    private PayStatus payStatus = PayStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "ship_status", nullable = false, length = 20)
    @Builder.Default
    private ShipStatus shipStatus = ShipStatus.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
