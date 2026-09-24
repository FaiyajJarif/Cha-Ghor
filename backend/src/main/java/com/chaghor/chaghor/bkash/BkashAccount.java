package com.chaghor.chaghor.bkash;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// The estate's corporate bKash disbursement wallet (V44). One row, id = 1.
//
// The balance here is PART OF Cash on Hand, not separate from it:
//
//     Cash on Hand = office cash + this balance
//
// Funding it is a transfer between two pockets the estate owns, so it costs
// nothing; money leaves the estate when a worker is paid out of it. See V44 and
// FinanceService.postBkashTopUp.
@Entity
@Table(name = "bkash_account")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BkashAccount {

    @Id
    private Long id; // always 1

    @Column(name = "wallet_number", nullable = false, length = 20)
    private String walletNumber;

    @Builder.Default
    @Column(name = "balance", nullable = false)
    private BigDecimal balance = BigDecimal.ZERO;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
