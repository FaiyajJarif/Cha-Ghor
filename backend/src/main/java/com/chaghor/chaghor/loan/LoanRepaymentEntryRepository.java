package com.chaghor.chaghor.loan;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LoanRepaymentEntryRepository extends JpaRepository<LoanRepaymentEntry, Long> {

    List<LoanRepaymentEntry> findByLoanIdOrderByPaidOnDescIdDesc(Long loanId);

    // v10 idempotency guard for the automatic payslip deduction.
    boolean existsByLoanIdAndPayrollId(Long loanId, Long payrollId);
}
