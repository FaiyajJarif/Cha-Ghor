package com.chaghor.chaghor.payroll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PayrollConfigRepository extends JpaRepository<PayrollConfig, Long> {

    // The "current" config = the most recently effective row.
    Optional<PayrollConfig> findTopByOrderByEffectiveFromDescIdDesc();
}
