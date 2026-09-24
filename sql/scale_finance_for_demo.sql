-- ===========================================================================
-- Shrink the Finance overview so a 100-taka movement is actually visible.
-- ===========================================================================
--
--   psql -h localhost -p 5433 -U chaghor -d chaghor -f sql/scale_finance_for_demo.sql
--
-- THE PROBLEM THIS SOLVES
--
-- Cash on Hand is not a stored number. It is a SUM over finance_ledger
-- computed fresh on every read (FinanceRepository.summary()). The V4 demo seed
-- puts six months of a real estate into that table -- 620,000 a month in bulk
-- tea sales against 185,000 of wages and so on -- which lands at roughly:
--
--   Total Revenue      3,877,500
--   Total Expenses     2,880,800
--   Cash on Hand       1,068,900
--   Payables Due          72,200
--   Overdue               27,000
--
-- A worker withdrawing 100 taka moves Cash on Hand by 0.0094%. The figure on
-- screen does not visibly change, so the single most important thing the system
-- does -- money leaving the estate, with a row to prove it -- is invisible in a
-- demo. Dividing the seed by 100 puts every card under 50,000 and makes that
-- same withdrawal just under 1% of cash.
--
-- ---------------------------------------------------------------------------
-- IT ONLY TOUCHES THE DEMO SEED, AND THAT IS THE WHOLE DESIGN
-- ---------------------------------------------------------------------------
--
-- WHERE source_type IS NULL.
--
-- V4 seeded its rows with no source_type. Every row the application posts for
-- itself sets one: payroll, withdrawal, loan_out, loan_in, advance_out,
-- advance_in, bkash_topup. So that one condition separates "invented scenery"
-- from "a real posting that reconciles against something else".
--
-- Scaling a real posting would be a genuine corruption, not a cosmetic change.
-- A loan_in row is tied by source_id to a loan_repayment_entry, and the
-- cashOnHand query looks that row up to decide whether the repayment already
-- came out of wages. loan.repaid would then disagree with the ledger that is
-- supposed to evidence it, and nothing on screen would say why. Same for a
-- withdrawal row against withdrawal_request.amount.
--
-- So real postings keep their true value. They are small anyway -- that is the
-- point of the exercise.
--
-- ---------------------------------------------------------------------------
-- RUNNING IT TWICE WOULD DIVIDE BY 10,000. IT IS GUARDED.
-- ---------------------------------------------------------------------------
-- Every row it touches is stamped in `note`. A second run finds the stamp and
-- aborts with a sentence instead of quietly turning 38,775 into 387.
--
-- There is an UNDO at the bottom of this file.
--
-- NOT REVERSIBLE BY FLYWAY, AND NOT A MIGRATION. This is a dev-data script
-- like sql/set_worker_phones.sql. Take a backup first if the database holds
-- anything you care about:
--
--   pg_dump -h localhost -p 5433 -U chaghor chaghor > ~/chaghor-backup.sql
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Refuse a second run.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    already int;
BEGIN
    SELECT count(*) INTO already
    FROM finance_ledger
    WHERE COALESCE(note, '') LIKE '%[demo-scaled]%';

    IF already > 0 THEN
        RAISE EXCEPTION
            'Already scaled: % ledger rows carry the [demo-scaled] stamp. '
            'Running again would divide by 100 a second time. Use the UNDO '
            'block at the bottom of this file if you want the original figures '
            'back.', already;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Before.
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- BEFORE ---'
SELECT
    to_char(COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0),
            'FM999,999,999.00')                                  AS "Total Revenue",
    to_char(COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0),
            'FM999,999,999.00')                                  AS "Total Expenses",
    to_char(COALESCE(SUM(CASE WHEN category = 'REVENUE' THEN amount ELSE -amount END)
                     FILTER (WHERE status = 'SETTLED'), 0),
            'FM999,999,999.00')                                  AS "Cash (approx)"
FROM finance_ledger;

-- ---------------------------------------------------------------------------
-- 2. Scale the seed.
-- ---------------------------------------------------------------------------
-- ROUND to 2 places because the column is NUMERIC(14,2) and the check
-- constraint chk_finance_amount_nonneg (V14) requires amount >= 0. Division by
-- a positive number cannot make a non-negative value negative, so the
-- constraint holds by construction rather than by hope.
UPDATE finance_ledger
SET amount = ROUND(amount / 100.0, 2),
    note   = COALESCE(note || ' ', '') || '[demo-scaled] original ' || amount::text
WHERE source_type IS NULL;

-- ---------------------------------------------------------------------------
-- 3. The bKash wallet, if one has been funded.
-- ---------------------------------------------------------------------------
-- The wallet balance is stored on its own row (V44), not derived, so it does
-- not move with the ledger. Left deliberately ALONE: whatever is in it was put
-- there by a real top-up that has a matching bkash_topup ledger row, and
-- changing one without the other breaks the second-pocket arithmetic that
-- invariant 5 depends on. Top it up or draw it down through the bKash Payout
-- page instead.

COMMIT;

-- ---------------------------------------------------------------------------
-- 4. After. These are the five numbers the Finance page will show.
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- AFTER (every figure should be under 50,000) ---'
SELECT
    to_char(COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0),
            'FM999,999,999.00')                                  AS "Total Revenue",
    to_char(COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0),
            'FM999,999,999.00')                                  AS "Total Expenses",
    to_char(COALESCE(SUM(CASE WHEN category = 'REVENUE' THEN amount ELSE -amount END)
                     FILTER (WHERE status = 'SETTLED'), 0),
            'FM999,999,999.00')                                  AS "Cash (approx)",
    to_char(COALESCE(SUM(amount) FILTER (
                WHERE status = 'PENDING'
                  AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'), 0),
            'FM999,999,999.00')                                  AS "Payables Due",
    to_char(COALESCE(SUM(amount) FILTER (
                WHERE status = 'PENDING' AND due_date < CURRENT_DATE), 0),
            'FM999,999,999.00')                                  AS "Overdue"
FROM finance_ledger;

\echo ''
\echo '--- rows left at full size (real postings - this is correct) ---'
SELECT source_type, count(*) AS rows, to_char(SUM(amount), 'FM999,999,999.00') AS total
FROM finance_ledger
WHERE source_type IS NOT NULL
GROUP BY source_type
ORDER BY source_type;

-- NOTE ON "Cash (approx)" ABOVE
--
-- The real cashOnHand in FinanceRepository.summary() has three extra arms that
-- this simplified version does not: bkash_topup counts as zero, advance_in
-- counts as zero, and loan_in counts as zero when the repayment already came
-- out of wages. All three only apply to rows with a source_type, so on a
-- database whose only rows are the demo seed the two agree exactly. Once you
-- have posted real withdrawals and loans they will differ slightly -- trust the
-- Finance page, not this query.


-- ===========================================================================
-- UNDO -- put the original figures back.
-- ===========================================================================
-- The original amount is stored in the note, so this reads it back rather than
-- multiplying by 100 (which would compound any rounding). Uncomment and run.
--
-- BEGIN;
--
-- UPDATE finance_ledger
-- SET amount = substring(note from '\[demo-scaled\] original ([0-9.]+)')::numeric,
--     note   = NULLIF(regexp_replace(note, '\s*\[demo-scaled\] original [0-9.]+', ''), '')
-- WHERE COALESCE(note, '') LIKE '%[demo-scaled]%';
--
-- COMMIT;
