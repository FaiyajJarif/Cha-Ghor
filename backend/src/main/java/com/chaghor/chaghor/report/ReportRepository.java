package com.chaghor.chaghor.report;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

// Backs the Reports module. Besides the CRUD over saved_report, it runs a set of
// read-only cross-module rollups (finance ledger, attendance, workforce, loans)
// used to build a report's KPIs and narrative. Aliases are quoted so the column
// labels match the projection getters exactly (Postgres would otherwise
// lower-case them). Enum columns are compared via ::text to stay type-safe.
public interface ReportRepository extends JpaRepository<SavedReport, Long> {

    // Saved reports, newest first (the "Generated Reports" table).
    List<SavedReport> findAllByOrderByGeneratedAtDesc();

    // Revenue / expense / payroll totals from the finance ledger for a period.
    @Query(value = """
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0) AS \"revenue\",
          COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0) AS \"expense\",
          COALESCE(SUM(amount) FILTER (WHERE category = 'PAYROLL'), 0) AS \"payroll\"
        FROM finance_ledger
        WHERE entry_date BETWEEN :start AND :end
        """, nativeQuery = true)
    FinanceAgg financeSummary(@Param("start") LocalDate start, @Param("end") LocalDate end);

    // Revenue + expense grouped by calendar month (chronological) for the trend.
    @Query(value = """
        SELECT to_char(date_trunc('month', entry_date), 'YYYY-MM') AS \"ym\",
               COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0) AS \"revenue\",
               COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0) AS \"expense\"
        FROM finance_ledger
        GROUP BY 1
        ORDER BY 1
        """, nativeQuery = true)
    List<MonthlyAgg> monthly();

    // Present-mark rate (0-100) across the period. status is the native
    // attendance_status enum, so compare via ::text; NULLIF guards div-by-zero.
    @Query(value = """
        SELECT COALESCE(ROUND(
                 100.0 * SUM(CASE WHEN status::text = 'present' THEN 1 ELSE 0 END)
                 / NULLIF(COUNT(*), 0), 1), 0)
        FROM attendance
        WHERE work_date BETWEEN :start AND :end
        """, nativeQuery = true)
    BigDecimal attendanceRate(@Param("start") LocalDate start, @Param("end") LocalDate end);

    // Count of currently active workers (headcount KPI).
    @Query(value = "SELECT COUNT(*) FROM workers WHERE status = 'active'", nativeQuery = true)
    long activeWorkers();

    // Loan capital still outstanding (ACTIVE + OVERDUE) and total recovered.
    @Query(value = """
        SELECT
          COALESCE(SUM(principal - repaid) FILTER (WHERE status IN ('ACTIVE','OVERDUE')), 0) AS \"outstanding\",
          COALESCE(SUM(repaid), 0) AS \"recovered\"
        FROM loan
        """, nativeQuery = true)
    LoanAgg loanTotals();

    interface FinanceAgg {
        BigDecimal getRevenue();
        BigDecimal getExpense();
        BigDecimal getPayroll();
    }

    interface MonthlyAgg {
        String getYm();
        BigDecimal getRevenue();
        BigDecimal getExpense();
    }

    interface LoanAgg {
        BigDecimal getOutstanding();
        BigDecimal getRecovered();
    }
}
