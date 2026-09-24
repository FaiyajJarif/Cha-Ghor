package com.chaghor.chaghor.bkash;

import org.springframework.data.jpa.repository.JpaRepository;

// One row, id = 1. Seeded by V44.
public interface BkashAccountRepository extends JpaRepository<BkashAccount, Long> {
}
