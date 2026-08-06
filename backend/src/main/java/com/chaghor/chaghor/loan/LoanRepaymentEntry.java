package com.chaghor.chaghor.loan;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// One recorded repayment against a loan (V19). Before this existed, `loan.repaid`
// was never incremented by any code path, so the "Recovered" KPI and every
// progress bar sat at zero forever. Each row also drives exactly one LOAN
// ledger line (source_type = 'loan_in'), which is why we need a per-repayment
// id -- using the loan id would make the idempotency guard collapse repeat
// repayments into a single ledger entry.
@Entity
@Table(name = "loan_repayment_entry")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoanRepaymentEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "loan_id", nullable = false)
    private Long loanId;

    @Column(name = "amount", nullable = false)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;

    @Column(name = "paid_on", nullable = false)
    @Builder.Default
    private LocalDate paidOn = LocalDate.now();

    @Column(name = "note")
    private String note;

    @Column(name = "recorded_by")
    private Long recordedBy;

    // v10: set when this repayment came from a payslip's automatic loan
    // deduction rather than from the Loans screen. A partial unique index on
    // (loan_id, payroll_id) stops one payslip ever being recovered twice.
    @Column(name = "payroll_id")
    private Long payrollId;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
