package com.chaghor.chaghor.bkash;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DisbursementBatchRepository extends JpaRepository<DisbursementBatch, Long> {

    List<DisbursementBatch> findTop20ByOrderByIdDesc();

    List<DisbursementBatch> findByStatusOrderByIdDesc(String status);
}
