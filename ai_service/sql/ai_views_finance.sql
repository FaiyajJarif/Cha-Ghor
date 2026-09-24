-- Cha Bot AI views - expansion to Payroll, Loans, and Finance.
-- Idempotent. Apply with:
--   PGPASSWORD=chaghor_dev_pw psql -h localhost -p 5433 -U chaghor -d chaghor -f ai_service/sql/ai_views_finance.sql
-- READ-ONLY curated views; sensitive columns are intentionally excluded.

-- 1) Payroll payslips. status is a native enum -> cast to TEXT so a wrong-case
--    value can never crash the query (worst case it just matches no rows).
--
-- ---------------------------------------------------------------------------
-- DROP FIRST. CREATE OR REPLACE IS NOT ENOUGH HERE, AND SILENTLY WAS NOT.
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW cannot change an existing column's TYPE. The first
-- version of this view exposed p.status as the native enum payroll_status; this
-- one casts it to text. Re-running the script against a database that already
-- had the old view therefore failed with:
--
--   ERROR: cannot change data type of view column "status"
--          from payroll_status to text
--
-- and -- this is the part that bites -- psql carried on with the REST of the
-- file. view_loan and view_finance were created, the GRANT ran, the script
-- looked like it worked, and view_payroll was left on its old definition. The
-- only clue was one ERROR line scrolling past between two successful CREATEs.
--
-- DROP ... CASCADE is deliberately NOT used: nothing should depend on this view,
-- and if something does, failing loudly is better than silently demolishing it.
DROP VIEW IF EXISTS view_payroll;

CREATE VIEW view_payroll AS
SELECT
    p.id              AS payroll_id,
    p.period_start,
    p.period_end,
    w.id              AS worker_id,
    w.full_name,
    w.job_role,
    z.name            AS zone_name,
    p.present_days,
    p.base_amount,
    p.surplus_amount,
    p.grade_bonus,
    p.gross_amount,
    p.loan_deduction,
    p.advance_recovery,
    -- THE FOURTH DEDUCTION (V39). It was missing from this view, so anything
    -- reading it saw only three of the four slices that recomputeNet subtracts:
    --   net = gross - loan - advance - overdraw - other
    -- A bot asked to check a payslip would have added up three, got a bigger
    -- number than net_payable, and reported a discrepancy that does not exist.
    p.overdraw_recovery,
    p.other_deduction,
    p.net_payable,
    p.status::text    AS status,   -- draft | review | approved | paid  (lowercase)
    p.paid_at
FROM payroll p
JOIN workers w ON w.id = p.worker_id
LEFT JOIN zones  z ON z.id = w.zone_id;

COMMENT ON VIEW view_payroll IS 'Cha Bot: payslip totals per worker per period.';

-- 2) Worker loans / advances ledger. status is VARCHAR (UPPERCASE).
CREATE OR REPLACE VIEW view_loan AS
SELECT
    l.id                       AS loan_id,
    l.reference,
    l.worker_name,
    l.zone                     AS zone_code,
    l.principal,
    l.repaid,
    (l.principal - l.repaid)   AS outstanding,
    l.daily_deduction,
    l.reason,
    l.status,         -- PENDING | ACTIVE | OVERDUE | REPAID | REJECTED
    l.requested_at,
    l.decided_at
FROM loan l;

COMMENT ON VIEW view_loan IS 'Cha Bot: worker loan / advance ledger.';

-- 3) Estate general ledger. category + status are VARCHAR (UPPERCASE).
CREATE OR REPLACE VIEW view_finance AS
SELECT
    f.id          AS ledger_id,
    f.entry_date,
    f.ref_id,
    f.category,    -- REVENUE | EXPENSE | PAYROLL | LOAN
    f.account,
    f.amount,
    f.status,      -- SETTLED | PENDING
    f.due_date,
    f.note
FROM finance_ledger f;

COMMENT ON VIEW view_finance IS 'Cha Bot: estate general ledger (finance).';

GRANT SELECT ON view_payroll, view_loan, view_finance TO chabot_readonly;
