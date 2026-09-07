package com.chaghor.chaghor.supply;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SalesTransactionRepository extends JpaRepository<SalesTransaction, Long> {
    Page<SalesTransaction> findAllByOrderByTxnDateDescIdDesc(Pageable pageable);
}
