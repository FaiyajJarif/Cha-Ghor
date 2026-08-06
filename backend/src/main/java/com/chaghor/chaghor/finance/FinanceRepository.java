package com.chaghor.chaghor.finance;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface FinanceRepository extends JpaRepository<FinanceEntry, Long> {

    // One-row rollup for the six KPI cards, computed in a single scan with
    // FILTER. Aliases are quoted so the column labels match the projection
    // getters exactly (Postgres would otherwise lower-case them).
    @Query(value = """
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0) AS \"totalRevenue\",
          COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0) AS \"totalExpenses\",
          COALESCE(SUM(CASE WHEN category = 'REVENUE' OR COALESCE(source_type, '') = 'loan_in' THEN amount ELSE -amount END)
                   FILTER (WHERE status = 'SETTLED'), 0) AS \"cashOnHand\",
          COALESCE(SUM(amount) FILTER (
                   WHERE status = 'PENDING'
                     AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'), 0) AS \"payablesDue\",
          COALESCE(SUM(amount) FILTER (
                   WHERE status = 'PENDING' AND due_date < CURRENT_DATE), 0) AS \"overdue\"
        FROM finance_ledger
        """, nativeQuery = true)
    SummaryAgg summary();

    // Revenue + expense grouped by calendar month (chronological order).
    @Query(value = """
        SELECT to_char(date_trunc('month', entry_date), 'YYYY-MM') AS \"ym\",
               COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0) AS \"revenue\",
               COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0) AS \"expense\"
        FROM finance_ledger
        GROUP BY 1
        ORDER BY 1
        """, nativeQuery = true)
    List<MonthlyAgg> monthly();

    // Expense + payroll spending grouped by account, biggest first (donut).
    @Query(value = """
        SELECT account AS \"label\", COALESCE(SUM(amount), 0) AS \"total\"
        FROM finance_ledger
        WHERE category IN ('EXPENSE','PAYROLL')
        GROUP BY account
        ORDER BY total DESC
        """, nativeQuery = true)
    List<BreakdownAgg> breakdown();

    // Paginated ledger with optional category/status/text filters. Empty-string
    // sentinels keep every bind parameter typed as text (avoids the Postgres
    // "lower(bytea)" untyped-null trap) and let a blank value mean "no filter".
    @Query(value = """
        SELECT * FROM finance_ledger e
        WHERE (:category = '' OR e.category = :category)
          AND (:status = '' OR e.status = :status)
          AND (:q = '' OR lower(e.account) LIKE lower('%' || :q || '%')
                       OR lower(COALESCE(e.ref_id, '')) LIKE lower('%' || :q || '%'))
        ORDER BY e.entry_date DESC, e.id DESC
        """,
        countQuery = """
        SELECT count(*) FROM finance_ledger e
        WHERE (:category = '' OR e.category = :category)
          AND (:status = '' OR e.status = :status)
          AND (:q = '' OR lower(e.account) LIKE lower('%' || :q || '%')
                       OR lower(COALESCE(e.ref_id, '')) LIKE lower('%' || :q || '%'))
        """,
        nativeQuery = true)
    Page<FinanceEntry> search(@Param("category") String category,
                              @Param("status") String status,
                              @Param("q") String q,
                              Pageable pageable);

    // ---- Money Movement feed (auto-posted rows only) -----------------------

    // The Finance page's activity table: payroll payments, worker withdrawals
    // and loan capital in/out. Manual entries are deliberately excluded -- the
    // General Ledger already shows those. The empty-string sentinel keeps the
    // bind parameter typed as text (same trick as search()).
    @Query(value = """
        SELECT * FROM finance_ledger e
        WHERE COALESCE(e.source_type, '') IN ('payroll','withdrawal','loan_out','loan_in')
          AND (:kind = '' OR COALESCE(e.source_type, '') = :kind)
        ORDER BY e.entry_date DESC, e.id DESC
        """,
        countQuery = """
        SELECT count(*) FROM finance_ledger e
        WHERE COALESCE(e.source_type, '') IN ('payroll','withdrawal','loan_out','loan_in')
          AND (:kind = '' OR COALESCE(e.source_type, '') = :kind)
        """,
        nativeQuery = true)
    Page<FinanceEntry> activity(@Param("kind") String kind, Pageable pageable);

    // Footer totals for the same filtered feed: cash out vs capital back in.
    @Query(value = """
        SELECT
          COALESCE(SUM(amount) FILTER (
            WHERE COALESCE(source_type, '') IN ('payroll','withdrawal','loan_out')), 0) AS \"totalOut\",
          COALESCE(SUM(amount) FILTER (
            WHERE COALESCE(source_type, '') = 'loan_in'), 0) AS \"totalIn\"
        FROM finance_ledger
        WHERE COALESCE(source_type, '') IN ('payroll','withdrawal','loan_out','loan_in')
          AND (:kind = '' OR COALESCE(source_type, '') = :kind)
        """, nativeQuery = true)
    ActivityTotals activityTotals(@Param("kind") String kind);

    // Idempotency guard for auto-posted rows (e.g. payroll payments): lets us
    // skip inserting a duplicate ledger line for the same source record.
    boolean existsBySourceTypeAndSourceId(String sourceType, Long sourceId);

    interface ActivityTotals {
        BigDecimal getTotalOut();
        BigDecimal getTotalIn();
    }

    interface SummaryAgg {
        BigDecimal getTotalRevenue();
        BigDecimal getTotalExpenses();
        BigDecimal getCashOnHand();
        BigDecimal getPayablesDue();
        BigDecimal getOverdue();
    }

    interface MonthlyAgg {
        String getYm();
        BigDecimal getRevenue();
        BigDecimal getExpense();
    }

    interface BreakdownAgg {
        String getLabel();
        BigDecimal getTotal();
    }
}
