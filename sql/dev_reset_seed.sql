-- ===========================================================================
--  dev_reset_seed.sql  --  DEVELOPMENT / DEMO DATA ONLY.  NOT A MIGRATION.
-- ===========================================================================
--
--  DO NOT run this against anything you care about. It DELETES every row in
--  `loan`, `loan_repayment_entry` and `finance_ledger` and replaces them with a
--  small, predictable demo set. It is not tracked by Flyway and must never be
--  copied into src/main/resources/db/migration -- V4 and V6 keep their original
--  checksums precisely because this file exists separately.
--
--  Run by hand:
--    PGPASSWORD=chaghor_dev_pw psql -h localhost -p 5433 -U chaghor -d chaghor \
--      -f sql/dev_reset_seed.sql
--
--  WHY THIS EXISTS
--    1. V6 seeds 18 loans with only a worker_name string ("Zawad", "Mukarram").
--       worker_id did not exist until V14, so every seeded loan has
--       worker_id = NULL. LoanService.plannedDeduction() looks loans up by
--       worker id, so no payslip ever received a loan deduction and the
--       cash-on-hand double-count could not be exercised. This re-seeds loans
--       that point at the REAL workers by worker_id, with worker_name and zone
--       kept in sync so the Loans screen (which renders the denormalised
--       columns, never a join) shows the truth.
--    2. V4 seeds six months at 620,000 revenue / 185,000 payroll. Cash on Hand
--       sits near 10.7 lakh, so a 4,500 payslip is invisible. Every amount here
--       is the V4 amount divided by 10, which lands Cash on Hand at 106,890.
--
--  SAFE TO RE-RUN. It deletes then re-inserts, and restarts both id sequences,
--  so a second run produces byte-identical data.
--
--  WHAT IT DOES NOT TOUCH: workers, zones, attendance, leaf_collection,
--  payroll_config, users. Schema is never altered.
--
--  KNOWN LEFTOVERS (deliberately not cleared -- outside the requested scope):
--    * `payroll` rows. A payslip already past Draft for the current period is
--      skipped by generate(), so re-testing may need:
--          DELETE FROM payroll WHERE period_start = date_trunc('month', CURRENT_DATE);
--    * `payroll_pending_recovery` rows from earlier withdrawal tests, which
--      will be drained into the next generated payslip as advance_recovery:
--          DELETE FROM payroll_pending_recovery WHERE applied_at IS NULL;
--
--  INVARIANT RESPECTED: finance_ledger.amount carries CHECK (amount >= 0)
--  (chk_finance_amount_nonneg, V14). Every amount below is positive. Direction
--  is expressed by category + source_type, never by a minus sign.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Fail loudly if the workers we expect are not there.
--    Silently inserting NULL worker_id is the exact bug this script fixes, so
--    a missing name must stop the script rather than reproduce it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    expected TEXT[] := ARRAY[
        'Abdul Karim', 'Rahima Begum', 'Jamal Uddin', 'Fatema Khatun', 'Nurul Islam'
    ];
    missing TEXT[];
BEGIN
    SELECT array_agg(n) INTO missing
      FROM unnest(expected) AS n
     WHERE NOT EXISTS (
         SELECT 1 FROM workers w WHERE lower(btrim(w.full_name)) = lower(btrim(n))
     );

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
            'dev_reset_seed: worker(s) not found: %. Expected the 5 workers seeded by DataInitializer.seedWorkforce(). Edit the `expected` array at the top of this script to match your workers table.',
            array_to_string(missing, ', ');
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. LOANS
--    loan_repayment_entry is cleared first. It would cascade from `loan`
--    anyway (V19 FK is ON DELETE CASCADE) but being explicit means this still
--    works if that FK is ever changed.
-- ---------------------------------------------------------------------------
DELETE FROM loan_repayment_entry;
DELETE FROM loan;

SELECT setval(pg_get_serial_sequence('loan', 'id'), 1, false);

-- Every row resolves worker_id, worker_name and zone from the workers table, so
-- the three can never drift apart. `zone` is the denormalised zone CODE that
-- Loans.jsx renders (loan.zone), not the zone id.
--
-- Layout, chosen so every Loans KPI has something to show:
--
--   status   | worker         | principal | repaid | daily | note
--   ---------+----------------+-----------+--------+-------+------------------
--   ACTIVE   | Abdul Karim    |     3,000 |  1,000 |    20 | round deduction
--   ACTIVE   | Rahima Begum   |     2,000 |    500 |    10 | round deduction
--   ACTIVE   | Jamal Uddin    |     5,000 |  4,800 |    25 | exercises the cap
--   OVERDUE  | Fatema Khatun  |     4,000 |  1,000 |    15 | overdue KPI
--   REPAID   | Nurul Islam    |     2,000 |  2,000 |    10 | recovered KPI
--   PENDING  | Nurul Islam    |     1,500 |      0 |    10 | request queue
--   PENDING  | Fatema Khatun  |     1,200 |      0 |    10 | request queue
--
-- Jamal Uddin is deliberate: 25/day over a full month plans far more than the
-- 200 still outstanding, so plannedDeduction() must clamp to 200. That is the
-- cheapest way to see the cap working.

INSERT INTO loan (reference, worker_id, worker_name, zone, principal, repaid,
                  daily_deduction, reason, status, requested_at, decided_at)
SELECT v.reference,
       w.id,
       w.full_name,
       z.code,
       v.principal,
       v.repaid,
       v.daily_deduction,
       v.reason,
       v.status,
       now() - v.requested_ago,
       CASE WHEN v.decided_ago IS NULL THEN NULL ELSE now() - v.decided_ago END
  FROM (VALUES
        -- reference,     full_name,        principal, repaid, daily, reason,                         status,    requested_ago,          decided_ago
        ('L-2026-201', 'Abdul Karim',      3000.00, 1000.00, 20.00, 'Roof repair before monsoon',    'ACTIVE',  INTERVAL '25 days',  INTERVAL '20 days'),
        ('L-2026-202', 'Rahima Begum',     2000.00,  500.00, 10.00, 'School fees',                   'ACTIVE',  INTERVAL '20 days',  INTERVAL '15 days'),
        ('L-2026-203', 'Jamal Uddin',      5000.00, 4800.00, 25.00, 'Medical treatment',             'ACTIVE',  INTERVAL '15 days',  INTERVAL '10 days'),
        ('L-2026-204', 'Fatema Khatun',    4000.00, 1000.00, 15.00, 'Family emergency',              'OVERDUE', INTERVAL '70 days',  INTERVAL '45 days'),
        ('L-2026-101', 'Nurul Islam',      2000.00, 2000.00, 10.00, 'Bicycle for commute',           'REPAID',  INTERVAL '90 days',  INTERVAL '60 days'),
        (NULL,         'Nurul Islam',      1500.00,    0.00, 10.00, 'Home repair after storm',       'PENDING', INTERVAL '2 hours',  NULL),
        (NULL,         'Fatema Khatun',    1200.00,    0.00, 10.00, 'School supplies',               'PENDING', INTERVAL '1 day',    NULL)
       ) AS v(reference, full_name, principal, repaid, daily_deduction, reason,
              status, requested_ago, decided_ago)
  JOIN workers w ON lower(btrim(w.full_name)) = lower(btrim(v.full_name))
  LEFT JOIN zones z ON z.id = w.zone_id;

-- ---------------------------------------------------------------------------
-- 2. FINANCE LEDGER
--    Same shape as V4 -- same categories, same six-month spread, same pending
--    and overdue rows -- with every amount divided by 10.
-- ---------------------------------------------------------------------------
DELETE FROM finance_ledger;

SELECT setval(pg_get_serial_sequence('finance_ledger', 'id'), 1, false);

-- Revenue: one bulk sale per month.  V4: 620,000 -> 62,000
INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
SELECT (m + INTERVAL '9 days')::date, 'TXN-' || to_char(m, 'YYMM') || '01',
       'REVENUE', 'Bulk Tea Sales', 62000, 'SETTLED'
  FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                       date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

-- Wages.  V4: 185,000 -> 18,500
INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
SELECT (m + INTERVAL '26 days')::date, 'PAY-' || to_char(m, 'YYMM') || '01',
       'PAYROLL', 'Field Wages', 18500, 'SETTLED'
  FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                       date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

-- Fertilizer.  V4: 115,000 -> 11,500
INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
SELECT (m + INTERVAL '12 days')::date, 'INV-' || to_char(m, 'YYMM') || '01',
       'EXPENSE', 'Fertilizer', 11500, 'SETTLED'
  FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                       date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

-- Logistics.  V4: 92,000 -> 9,200
INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
SELECT (m + INTERVAL '15 days')::date, 'LOG-' || to_char(m, 'YYMM') || '01',
       'EXPENSE', 'Logistics', 9200, 'SETTLED'
  FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                       date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

-- Maintenance.  V4: 69,000 -> 6,900
INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
SELECT (m + INTERVAL '18 days')::date, 'MNT-' || to_char(m, 'YYMM') || '01',
       'EXPENSE', 'Maintenance', 6900, 'SETTLED'
  FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                       date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

-- Recent individually-visible rows. The last three are PENDING and feed the
-- "Payables due (7 days)" and "Overdue" cards, exactly as in V4.
INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status, due_date) VALUES
  (CURRENT_DATE,     'TXN-98671', 'REVENUE', 'Outlet Sales',   1250, 'SETTLED', NULL),
  (CURRENT_DATE - 1, 'TXN-98210', 'REVENUE', 'Local Market',  14500, 'SETTLED', NULL),
  (CURRENT_DATE - 1, 'UTL-00421', 'EXPENSE', 'Electricity',    2840, 'SETTLED', NULL),
  (CURRENT_DATE - 2, 'MISC-9902', 'EXPENSE', 'Staff Training', 1420, 'SETTLED', NULL),
  (CURRENT_DATE - 2, 'INV-12908', 'EXPENSE', 'Chemicals',      6400, 'PENDING', CURRENT_DATE + 4),
  (CURRENT_DATE - 3, 'MNT-55091', 'EXPENSE', 'Vehicle Repair',  820, 'PENDING', CURRENT_DATE + 6),
  (CURRENT_DATE - 5, 'LNO-44590', 'LOAN',    'Equip. Finance', 2700, 'PENDING', CURRENT_DATE - 3);

COMMIT;

-- ===========================================================================
--  What you should see afterwards
-- ===========================================================================
--
--  Cash on Hand              106,890.00   (was 1,068,900.00)
--  Total revenue             387,750.00
--  Total expenses            280,860.00
--  Payables due (7 days)       7,220.00   (6,400 + 820)
--  Overdue                     2,700.00
--
--  Loans: 3 ACTIVE, 1 OVERDUE, 1 REPAID, 2 PENDING. Recovered 9,300.00.
--  Approved (last 30 days) = 3.  Every loan has a non-null worker_id.
--
--  Then, to exercise the loan deduction:
--    1. Payroll -> Generate for the current period.
--    2. Abdul Karim's payslip shows loanDeduction = 20 x present days
--       (capped at the 2,000 still outstanding).
--       Rahima Begum's shows 10 x present days (capped at 1,500).
--       Jamal Uddin's is capped at 200 -- his outstanding balance -- however
--       many days he worked. That row is the cap test.
--    3. Note Cash on Hand, then run that payslip draft -> review -> approved
--       -> paid, and note it again. It must fall by the FULL netPayable.
--       If it falls by netPayable minus the loan deduction, the double-count
--       is back.
--
--  Verify the links took:
--    SELECT id, reference, worker_id, worker_name, zone, principal, repaid,
--           daily_deduction, status
--      FROM loan ORDER BY id;
--
--    SELECT count(*) AS loans_with_no_worker FROM loan WHERE worker_id IS NULL;
--    -- must be 0
-- ===========================================================================
