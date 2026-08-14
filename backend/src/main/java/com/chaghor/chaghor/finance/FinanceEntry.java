package com.chaghor.chaghor.finance;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// One line of the estate general ledger (`finance_ledger`). Unlike Payroll,
// this is a fresh table that stores category/status as plain VARCHARs, so we map
// the Java enums with @Enumerated(STRING) — no native Postgres enum type needed.
@Entity
@Table(name = "finance_ledger")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FinanceEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Column(name = "ref_id", length = 40)
    private String refId;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 20)
    private LedgerCategory category;

    @Column(name = "account", nullable = false, length = 160)
    private String account;

    @Column(name = "amount", nullable = false)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private LedgerStatus status = LedgerStatus.SETTLED;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "note")
    private String note;

    @Column(name = "source_type", length = 20)
    private String sourceType;

    @Column(name = "source_id")
    private Long sourceId;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
