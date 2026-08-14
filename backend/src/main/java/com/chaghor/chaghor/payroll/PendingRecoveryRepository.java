package com.chaghor.chaghor.payroll;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.List;

public interface PendingRecoveryRepository extends JpaRepository<PendingRecovery, Long> {

    // Everything still owed by one worker, oldest first (drained at generation).
    List<PendingRecovery> findByWorkerIdAndAppliedAtIsNullOrderByIdAsc(Long workerId);

    // Everything still owed, across all workers -- powers the admin banner.
    List<PendingRecovery> findByAppliedAtIsNullOrderByIdAsc();

    long countByAppliedAtIsNull();

    @Query("SELECT COALESCE(SUM(r.amount), 0) FROM PendingRecovery r WHERE r.appliedAt IS NULL")
    BigDecimal totalOutstanding();
}
