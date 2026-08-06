package com.chaghor.chaghor.loan;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface LoanAiAssessmentRepository extends JpaRepository<LoanAiAssessment, Long> {

    // loan_id is UNIQUE, so re-scoring updates this row rather than adding one.
    Optional<LoanAiAssessment> findByLoanId(Long loanId);

    // Used to show existing scores against the pending queue without re-running
    // the model for every row.
    List<LoanAiAssessment> findByLoanIdIn(Collection<Long> loanIds);
}
