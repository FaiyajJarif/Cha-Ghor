package com.chaghor.chaghor.loan;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface LoanRepaymentEntryRepository extends JpaRepository<LoanRepaymentEntry, Long> {

    List<LoanRepaymentEntry> findByLoanIdOrderByPaidOnDescIdDesc(Long loanId);

    // v10 idempotency guard for the automatic payslip deduction.
    boolean existsByLoanIdAndPayrollId(Long loanId, Long payrollId);

    // Which of these repayments came out of a payslip rather than out of the
    // worker's pocket. payroll_id is set only by LoanService.recoverFromPayslip;
    // a repayment typed into the Loans UI leaves it null (see V20). The Finance
    // activity feed uses this to avoid badging a wage deduction as cash coming in.
    List<LoanRepaymentEntry> findByIdInAndPayrollIdIsNotNull(Collection<Long> ids);

    // "Was this repayment withheld from wages rather than handed over?"
    // Both arms matter: payroll_id for the retired monthly path, settlement_id
    // for daily settlement. Checking only the first marked every daily
    // deduction as though cash had arrived.
    @org.springframework.data.jpa.repository.Query("""
           select r from LoanRepaymentEntry r
           where r.id in :ids
             and (r.payrollId is not null or r.settlementId is not null)
           """)
    List<LoanRepaymentEntry> findWageWithheld(
            @org.springframework.data.repository.query.Param("ids") Collection<Long> ids);

    // Live repayments for a loan -- a reversed one did not really happen.
    List<LoanRepaymentEntry> findBySettlementIdAndReversedAtIsNull(Long settlementId);
}
