-- ===========================================================================
-- Bring every Finance card under 50,000 WITHOUT flipping any sign.
-- ===========================================================================
--
--   psql -h localhost -p 5433 -U chaghor -d chaghor -f sql/resize_finance_demo.sql
--
-- Supersedes sql/scale_finance_for_demo.sql, which divided by 100 and turned
-- Net Profit and Cash on Hand negative. Do not run that one.
--
-- ---------------------------------------------------------------------------
-- WHY 10 AND NOT 100
-- ---------------------------------------------------------------------------
--
-- This ledger is roughly:
--
--   seed / manual rows (source_type IS NULL)   revenue 387,537   expense 287,868
--   real postings      (source_type SET)       revenue     213   expense   3,658
--
-- Only the seed may be scaled -- a real posting reconciles against another
-- table (loan_in against loan_repayment_entry, withdrawal against
-- withdrawal_request, bkash_topup against the wallet row) and rewriting its
-- amount would make those disagree silently.
--
-- But the real postings are 3,658 of EXPENSE against 213 of REVENUE. Divide the
-- seed by 100 and the revenue side collapses to 3,875 while 3,658 of real
-- expense stands untouched -- the subtraction goes negative. That is exactly
-- what happened.
--
-- Divide by 10 and the scaled seed revenue (38,754) still comfortably clears
-- the real expenses, so every figure stays positive:
--
--                        before        after /10
--   Total Revenue       387,750           38,966
--   Total Expenses      291,526           32,445
--   Net Profit           96,224           +6,521
--   Cash on Hand        101,000           +6,999
--   Overdue               9,920              992
--
-- ---------------------------------------------------------------------------
-- THE HEADROOM IS FINITE -- KNOW WHERE THE EDGE IS
-- ---------------------------------------------------------------------------
-- After this runs, cash on hand is about 7,000 and every further test posting
-- (a withdrawal, a payroll settlement) pushes it down at full size while the
-- seed stays small. Roughly 30 more test withdrawals at 240 taka would exhaust
-- it and the cards would go negative again -- not because anything is broken,
-- but because a demo estate with no revenue being posted really does run out
-- of money. Post a revenue entry through "Add entry" when that happens.
--
-- ---------------------------------------------------------------------------
-- IT CHECKS ITS OWN WORK AND ROLLS BACK IF IT IS WRONG
-- ---------------------------------------------------------------------------
-- The previous script computed a result and trusted it. This one asserts, after
-- the UPDATE and before COMMIT, that every card is under 50,000 AND that
-- neither Net Profit nor Cash on Hand is negative. If any of that fails the
-- whole transaction aborts and nothing changes.
--
-- Take a backup anyway:
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
            'Already scaled: % rows carry the [demo-scaled] stamp. Run '
            'sql/undo_finance_scale.sql first if you want to start over.', already;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Scale the seed by 10, stamping the original into `note` so the undo
--    script can restore it exactly.
-- ---------------------------------------------------------------------------
UPDATE finance_ledger
SET amount = ROUND(amount / 10.0, 2),
    note   = COALESCE(note || ' ', '') || '[demo-scaled] original ' || amount::text
WHERE source_type IS NULL;

-- ---------------------------------------------------------------------------
-- 2. ASSERT THE RESULT. This is the part the last script did not have.
-- ---------------------------------------------------------------------------
-- cashOnHand is copied from FinanceRepository.summary() including its three
-- special arms, so this is the number the Finance page will actually show --
-- not a simplification that happens to agree on a clean database.
DO $$
DECLARE
    rev      numeric;
    exp      numeric;
    cash     numeric;
    payables numeric;
    overdue  numeric;
    net      numeric;
BEGIN
    SELECT
        COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0),
        COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0),
        COALESCE(SUM(CASE
            WHEN category = 'REVENUE' THEN amount
            WHEN COALESCE(source_type, '') = 'bkash_topup' THEN 0
            WHEN COALESCE(source_type, '') = 'advance_in'  THEN 0
            WHEN COALESCE(source_type, '') IN ('loan_in','loan_in_reversal') THEN
                 CASE WHEN EXISTS (SELECT 1 FROM loan_repayment_entry r
                                    WHERE r.id = finance_ledger.source_id
                                      AND (r.payroll_id IS NOT NULL
                                           OR r.settlement_id IS NOT NULL
                                           OR r.reversed_at IS NOT NULL))
                      THEN 0
                      WHEN COALESCE(source_type, '') = 'loan_in_reversal'
                      THEN -amount
                      ELSE amount END
            ELSE -amount END) FILTER (WHERE status = 'SETTLED'), 0),
        COALESCE(SUM(amount) FILTER (
            WHERE status = 'PENDING'
              AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'), 0),
        COALESCE(SUM(amount) FILTER (
            WHERE status = 'PENDING' AND due_date < CURRENT_DATE), 0)
    INTO rev, exp, cash, payables, overdue
    FROM finance_ledger;

    net := rev - exp;

    RAISE NOTICE 'Revenue % | Expenses % | Net % | Cash % | Payables % | Overdue %',
                 rev, exp, net, cash, payables, overdue;

    -- A negative Net Profit or Cash on Hand is the exact failure the last
    -- script shipped. Refuse to commit it.
    IF net < 0 THEN
        RAISE EXCEPTION 'ROLLED BACK: Net Profit came out negative (%). The '
                        'real expense postings now outweigh the scaled revenue. '
                        'Nothing has been changed.', net;
    END IF;

    IF cash < 0 THEN
        RAISE EXCEPTION 'ROLLED BACK: Cash on Hand came out negative (%). '
                        'Nothing has been changed.', cash;
    END IF;

    -- And the thing that was actually asked for.
    IF GREATEST(rev, exp, net, cash, payables, overdue) >= 50000 THEN
        RAISE EXCEPTION 'ROLLED BACK: at least one card is still 50,000 or more '
                        '(largest is %). Nothing has been changed.',
                        GREATEST(rev, exp, net, cash, payables, overdue);
    END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. The five cards as the Finance page will render them.
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- Finance Overview, after ---'
SELECT
    to_char(COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0),
            'FM999,999.00')                                   AS "Revenue",
    to_char(COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0),
            'FM999,999.00')                                   AS "Expenses",
    to_char(COALESCE(SUM(amount) FILTER (WHERE category = 'REVENUE'), 0)
          - COALESCE(SUM(amount) FILTER (WHERE category IN ('EXPENSE','PAYROLL')), 0),
            'FM999,999.00')                                   AS "Net Profit",
    to_char(COALESCE(SUM(amount) FILTER (
                WHERE status = 'PENDING' AND due_date < CURRENT_DATE), 0),
            'FM999,999.00')                                   AS "Overdue"
FROM finance_ledger;

\echo ''
\echo '--- untouched real postings (correct: these keep their true value) ---'
SELECT source_type, count(*) AS rows, to_char(SUM(amount), 'FM999,999.00') AS total
FROM finance_ledger
WHERE source_type IS NOT NULL
GROUP BY source_type
ORDER BY source_type;

-- To reverse this: sql/undo_finance_scale.sql
