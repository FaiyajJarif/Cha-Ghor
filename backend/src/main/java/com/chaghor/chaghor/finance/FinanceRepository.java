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
    //
    // cashOnHand: `loan_in` is NOT unconditionally an inflow. Only a repayment
    // the worker physically handed over moves cash:
    //   * recorded by hand in the Loans UI -> money really arrived, cash UP.
    //     Both payroll_id and settlement_id are NULL.
    //   * withheld from wages              -> nothing arrived. The estate simply
    //     pays out less when the worker withdraws, and the withdrawal row
    //     already carries that. Counting it again credits the same taka twice.
    //     payroll_id IS NOT NULL (legacy monthly) OR settlement_id IS NOT NULL
    //     (daily settlement, V35).
    //
    // THE settlement_id ARM WAS MISSING AND IT WAS A REAL BUG.
    // When settlement took over loan recovery it called recover() with a null
    // payrollId -- correctly, no payslip is involved -- and every daily ৳20
    // deduction started being counted here as if a worker had walked into the
    // office with notes in his hand. Cash on Hand climbed by the estate's own
    // withholdings. The test that would have caught it is: recovering a loan
    // from wages must not change cash on hand at all.
    //
    // Reversed repayments are excluded outright: a reversal means the repayment
    // did not really happen, so neither it nor its compensating row should
    // survive in the rollup.
    //
    // Amounts stay positive (chk_finance_amount_nonneg, V14); direction still
    // comes from category + source_type, never from a sign.
    // A loan_in row with no matching repayment row (orphan) keeps the old
    // inflow behaviour -- we only neutralise when we can positively prove the
    // repayment came out of wages.
    @Query(value = """
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0) AS \"totalRevenue\",
          COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0) AS \"totalExpenses\",
          COALESCE(SUM(CASE
                   WHEN category = 'REVENUE' THEN amount
                   WHEN COALESCE(source_type, '') IN ('loan_in', 'loan_in_reversal') THEN
                        CASE WHEN EXISTS (SELECT 1 FROM loan_repayment_entry r
                                           WHERE r.id = finance_ledger.source_id
                                             AND (r.payroll_id IS NOT NULL
                                                  OR r.settlement_id IS NOT NULL
                                                  OR r.reversed_at IS NOT NULL))
                             THEN 0
                             WHEN COALESCE(source_type, '') = 'loan_in_reversal'
                             THEN -amount
                             ELSE amount END
                   ELSE -amount END)
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
    // `totalIn` counts only repayments that actually brought cash in, on the
    // same rule as cashOnHand above -- a wage-deducted repayment is in neither
    // total, because the PAYROLL row already carries the reduced netPayable.
    @Query(value = """
        SELECT
          COALESCE(SUM(amount) FILTER (
            WHERE COALESCE(source_type, '') IN ('payroll','withdrawal','loan_out')), 0) AS \"totalOut\",
          COALESCE(SUM(amount) FILTER (
            WHERE COALESCE(source_type, '') = 'loan_in'
              AND NOT EXISTS (SELECT 1 FROM loan_repayment_entry r
                               WHERE r.id = finance_ledger.source_id
                                 AND r.payroll_id IS NOT NULL)), 0) AS \"totalIn\"
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
