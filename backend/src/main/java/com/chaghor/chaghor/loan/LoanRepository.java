package com.chaghor.chaghor.loan;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;

public interface LoanRepository extends JpaRepository<Loan, Long> {

    // Pending request queue, newest first.
    List<Loan> findByStatusOrderByRequestedAtDesc(LoanStatus status);

    // Active repayments table (ACTIVE + OVERDUE), paginated.
    Page<Loan> findByStatusInOrderByReferenceAsc(Collection<LoanStatus> statuses, Pageable pageable);

    long countByStatus(LoanStatus status);

    long countByStatusIn(Collection<LoanStatus> statuses);

    // "Approved" KPI: loans decided (not rejected) in the last 30 days.
    long countByStatusInAndDecidedAtAfter(Collection<LoanStatus> statuses, OffsetDateTime t);

    // "Recovered" KPI: total capital recovered via deductions.
    @Query("SELECT COALESCE(SUM(l.repaid), 0) FROM Loan l")
    BigDecimal totalRecovered();

    // v10: one worker's outstanding loans, oldest first. Payroll uses this to
    // work out the automatic wage deduction and to settle it oldest-debt-first
    // when the payslip is paid.
    List<Loan> findByWorkerIdAndStatusInOrderByIdAsc(Long workerId, Collection<LoanStatus> statuses);
}
