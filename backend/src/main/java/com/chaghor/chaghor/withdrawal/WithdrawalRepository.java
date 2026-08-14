package com.chaghor.chaghor.withdrawal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WithdrawalRepository extends JpaRepository<WithdrawalRequest, Long> {

    // Admin queue, newest first, filtered by status.
    List<WithdrawalRequest> findByStatusOrderByRequestedAtDesc(WithdrawalStatus status);

    // A single worker's request history (worker dashboard).
    List<WithdrawalRequest> findByWorkerIdOrderByRequestedAtDesc(Long workerId);

    long countByStatus(WithdrawalStatus status);
}
