-- ============================================================================
-- READ-ONLY DIAGNOSTIC. Nothing in this file writes. Run it, paste the output.
-- ============================================================================
--
-- Purpose: work out what is actually true about Abdul Karim's payslip #7 and
-- his ৳500 advance BEFORE anything is changed.
--
-- Why a diagnostic and not a fix:
--   The remedy depends entirely on which of three things happened, and they are
--   indistinguishable from outside the database.
--
--     (a) the ৳215 on payslip #7 was recovered and cash genuinely moved,
--     (b) it was recorded on the payslip but no cash ever left,
--     (c) it was double-counted against a withdrawal that also posted.
--
--   In case (a) the advance is ৳285 outstanding and nothing needs fixing. In
--   (b) it is ৳500 and the payslip line is fiction. In (c) the worker has been
--   charged twice and is owed money back. Writing an UPDATE that guesses
--   between them is how a wage dispute gets baked into the ledger permanently.
--
-- Run:
--   docker exec -i <pg-container> psql -U chaghor -d chaghor -f - < sql/diagnose_abdul.sql
--   (or paste section by section into psql)

\echo '=== 1. Who is Abdul, and is he active? ================================'
SELECT id, full_name, status, deleted_at
FROM workers
WHERE full_name ILIKE '%abdul%';

\echo ''
\echo '=== 2. Every payslip he has ==========================================='
-- Looking for #7: status paid, zero figures, period 01-31 Aug.
SELECT id, period_start, period_end, status,
       present_days, base_amount, surplus_amount, grade_bonus,
       gross_amount, loan_deduction, advance_recovery, other_deduction,
       net_payable, paid_at
FROM payroll
WHERE worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')
ORDER BY period_start, id;

\echo ''
\echo '=== 3. His withdrawals — this is where the 500 lives =================='
-- kind was added in V33 and BACKFILLED TO 'advance' for every pre-existing row.
-- If an old row was really a salary payout, it is mislabelled as a debt here
-- and that alone would explain a 500 that will not clear.
SELECT id, amount, kind, status, method, requested_at, processed_at
FROM withdrawal_request
WHERE worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')
ORDER BY id;

\echo ''
\echo '=== 4. Parked recoveries from the old monthly model ==================='
-- applied_at IS NULL means it never landed on a payslip. Under daily settlement
-- nothing writes here any more, so these rows are history.
SELECT id, amount, source_type, source_id, note, created_at, applied_at, payroll_id
FROM payroll_pending_recovery
WHERE worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')
ORDER BY id;

\echo ''
\echo '=== 5. What daily settlement has recorded ============================='
-- Empty means settlement has never run for him, which by itself explains a
-- frozen loan balance and a screen still saying "will be deducted".
SELECT work_date, earned, to_loan, to_advance, payable, settled_at
FROM daily_settlement
WHERE worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')
ORDER BY work_date;

\echo ''
\echo '=== 6. His loans and how much has actually been repaid ================'
SELECT id, reference, principal, repaid, daily_deduction, status, requested_at, decided_at
FROM loan
WHERE worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')
ORDER BY id;

\echo ''
\echo '=== 7. Individual repayment entries ==================================='
-- payroll_id NOT NULL = recovered by the old markPaid path.
-- payroll_id NULL     = recovered by daily settlement.
SELECT r.id, r.loan_id, r.amount, r.paid_on, r.payroll_id, r.note
FROM loan_repayment_entry r
JOIN loan l ON l.id = r.loan_id
WHERE l.worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')
ORDER BY r.id;

\echo ''
\echo '=== 8. Did cash actually move? ========================================'
-- The question that separates case (a) from case (b). A payroll posting for
-- payslip #7 means the net really left; nothing here means it did not.
SELECT id, entry_date, category, source_type, source_id, account, amount, note
FROM finance_ledger
WHERE (source_type = 'payroll'    AND source_id IN (
         SELECT id FROM payroll
         WHERE worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')))
   OR (source_type = 'withdrawal' AND source_id IN (
         SELECT id FROM withdrawal_request
         WHERE worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')))
ORDER BY id;

\echo ''
\echo '=== 9. Raw material: does he have attendance and leaf in August? ======'
-- If payslip #7 says 0 days and this says otherwise, the payslip is stale, not
-- the register — and regenerating now fixes it, because the freeze is gone.
SELECT a.work_date, a.status
FROM attendance a
WHERE a.worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')
  AND a.work_date BETWEEN DATE '2026-08-01' AND DATE '2026-08-31'
ORDER BY a.work_date;

SELECT collect_date, SUM(weight_kg) AS kg
FROM leaf_collection
WHERE worker_id IN (SELECT id FROM workers WHERE full_name ILIKE '%abdul%')
  AND collect_date BETWEEN DATE '2026-08-01' AND DATE '2026-08-31'
GROUP BY collect_date
ORDER BY collect_date;
