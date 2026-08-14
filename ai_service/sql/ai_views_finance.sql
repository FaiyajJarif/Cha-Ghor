-- Cha Bot AI views - expansion to Payroll, Loans, and Finance.
-- Idempotent. Apply with:
--   PGPASSWORD=chaghor_dev_pw psql -h localhost -p 5433 -U chaghor -d chaghor -f ai_service/sql/ai_views_finance.sql
-- READ-ONLY curated views; sensitive columns are intentionally excluded.

-- 1) Payroll payslips. status is a native enum -> cast to TEXT so a wrong-case
--    value can never crash the query (worst case it just matches no rows).
CREATE OR REPLACE VIEW view_payroll AS
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
