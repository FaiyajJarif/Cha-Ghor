package com.chaghor.chaghor.payroll;

import com.chaghor.chaghor.payroll.dto.TrendPoint;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PayrollRepository extends JpaRepository<Payroll, Long> {

    // All payslips in a period (the cycle view).
    List<Payroll> findByPeriodStartAndPeriodEndOrderByIdAsc(LocalDate periodStart, LocalDate periodEnd);

    // Payslips in a period filtered by status.
    List<Payroll> findByPeriodStartAndPeriodEndAndStatusOrderByIdAsc(
            LocalDate periodStart, LocalDate periodEnd, PayrollStatus status);

    // Used by generate() to upsert one worker's draft for a period.
    Optional<Payroll> findByWorkerIdAndPeriodStartAndPeriodEnd(
            Long workerId, LocalDate periodStart, LocalDate periodEnd);

    // Net pay total per period, newest first (feeds the "Net Pay Trend" chart).
    // The Pageable caps how many recent periods we return.
    @Query("""
            SELECT new com.chaghor.chaghor.payroll.dto.TrendPoint(
                p.periodStart, p.periodEnd, SUM(p.netPayable))
            FROM Payroll p
            GROUP BY p.periodStart, p.periodEnd
            ORDER BY p.periodStart DESC
            """)
    List<TrendPoint> findNetTrend(Pageable pageable);
}
