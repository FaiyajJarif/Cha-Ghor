-- ===========================================================================
-- UNDO scale_finance_for_demo.sql, then show what is ACTUALLY in the ledger.
-- ===========================================================================
--
--   psql -h localhost -p 5433 -U chaghor -d chaghor -f sql/undo_finance_scale.sql
--
-- ---------------------------------------------------------------------------
-- WHAT WENT WRONG, SO IT IS NOT REPEATED
-- ---------------------------------------------------------------------------
--
-- scale_finance_for_demo.sql divided every row with source_type IS NULL by 100
-- and deliberately left real postings alone, to protect the loan_in / payroll /
-- withdrawal rows that reconcile against other tables.
--
-- That reasoning was right about integrity and wrong about arithmetic.
--
-- Cash on Hand is revenue MINUS expenses. On this database the revenue rows
-- were the untagged ones and the expense rows were largely real postings, so
-- scaling by source_type scaled the revenue side and not the expense side. The
-- two sides are no longer measured in the same units, and the subtraction went
-- negative. Dividing EVERY row by 100 cannot change a sign. Dividing SOME rows
-- by 100 can, and did.
--
-- The second mistake was predicting the before-and-after figures from
-- V4__finance_ledger.sql without checking it had ever run. Its seed sits inside
--
--     IF NOT EXISTS (SELECT 1 FROM finance_ledger)
--
-- so on any database that already had a single ledger row, none of those
-- amounts were ever inserted. The quoted totals described a database that does
-- not exist.
--
-- ---------------------------------------------------------------------------
-- THIS RESTORES EXACT ORIGINALS
-- ---------------------------------------------------------------------------
-- Not by multiplying by 100 -- that would compound the rounding the division
-- introduced. The original amount was written into `note` as it was scaled, so
-- this reads it back verbatim and then removes the stamp.
--
-- Rows the scaling never touched are not matched and are not modified.
-- ===========================================================================

BEGIN;

-- Refuse to run if there is nothing to undo, rather than silently doing
-- nothing and letting you believe it worked.
DO $$
DECLARE
    stamped int;
BEGIN
    SELECT count(*) INTO stamped
    FROM finance_ledger
    WHERE COALESCE(note, '') LIKE '%[demo-scaled]%';

    IF stamped = 0 THEN
        RAISE EXCEPTION
            'No ledger row carries the [demo-scaled] stamp, so there is nothing '
            'to undo. Either the scaling script was never run, or it has already '
            'been undone.';
    END IF;

    RAISE NOTICE 'Restoring % scaled rows.', stamped;
END $$;

UPDATE finance_ledger
SET amount = substring(note from '\[demo-scaled\] original ([0-9.]+)')::numeric,
    note   = NULLIF(
                 btrim(regexp_replace(note, '\s*\[demo-scaled\] original [0-9.]+', '')),
                 '')
WHERE COALESCE(note, '') LIKE '%[demo-scaled]%';

-- Nothing should carry the stamp now. If something does, the regex failed to
-- match a row it matched a moment ago, and stopping loudly beats leaving the
-- ledger half-restored.
DO $$
DECLARE
    leftover int;
BEGIN
    SELECT count(*) INTO leftover
    FROM finance_ledger
    WHERE COALESCE(note, '') LIKE '%[demo-scaled]%';

    IF leftover > 0 THEN
        RAISE EXCEPTION 'ROLLED BACK: % rows still carry the stamp after the '
                        'restore. Nothing has been changed.', leftover;
    END IF;
END $$;

COMMIT;

-- ===========================================================================
-- Now: what is actually in this ledger? Read this before changing any money.
-- ===========================================================================
\echo ''
\echo '=== 1. The five cards, restored ==='
SELECT
    to_char(COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0),
            'FM999,999,999.00')                           AS "Total Revenue",
    to_char(COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0),
            'FM999,999,999.00')                           AS "Total Expenses",
    to_char(COALESCE(SUM(CASE WHEN category = 'REVENUE' THEN amount ELSE -amount END)
                     FILTER (WHERE status = 'SETTLED'), 0),
            'FM999,999,999.00')                           AS "Cash (approx)"
FROM finance_ledger;

\echo ''
\echo '=== 2. Composition: this is what the last change should have been based on ==='
SELECT COALESCE(source_type, '(none - seed or manual)') AS source,
       category,
       count(*)                                          AS rows,
       to_char(SUM(amount), 'FM999,999,999.00')          AS total
FROM finance_ledger
GROUP BY 1, 2
ORDER BY SUM(amount) DESC;

\echo ''
\echo '=== 3. The ten biggest rows - usually where an odd total comes from ==='
SELECT id, entry_date, category, account,
       to_char(amount, 'FM999,999,999.00') AS amount,
       status, COALESCE(source_type, '-') AS source
FROM finance_ledger
ORDER BY amount DESC
LIMIT 10;

\echo ''
\echo '=== 4. Soft-deleted rows STILL COUNT in every figure above ==='
-- Nothing in the finance slice filters deleted_at -- not summary(), not
-- search(), not the Java. If this returns rows, they are inflating the cards
-- and no screen says so.
SELECT count(*) AS soft_deleted_rows,
       to_char(COALESCE(SUM(amount), 0), 'FM999,999,999.00') AS total_still_counted
FROM finance_ledger
WHERE deleted_at IS NOT NULL;
