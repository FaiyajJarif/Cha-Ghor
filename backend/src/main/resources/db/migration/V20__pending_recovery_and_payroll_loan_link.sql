-- V20 (v10)
-- 1) Deferred advance recovery.
--    v9 posted the withdrawal ledger line and then tried to add the amount to
--    advance_recovery on the worker's current payslip. If no payslip existed
--    yet, or it had already been Approved/Paid, the recovery was SILENTLY
--    SKIPPED and the worker kept money they had already been advanced.
--    Now every recovery that cannot be applied immediately is parked here and
--    drained the next time payslips are generated for that worker.
-- 2) Link repayments back to the payslip that produced them, so the automatic
--    loan deduction cannot be double-recorded.

CREATE TABLE IF NOT EXISTS payroll_pending_recovery (
    id          BIGSERIAL PRIMARY KEY,
    worker_id   BIGINT        NOT NULL,
    amount      NUMERIC(14,2) NOT NULL,
    source_type VARCHAR(20)   NOT NULL,
    source_id   BIGINT,
    note        TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    applied_at  TIMESTAMPTZ,
    payroll_id  BIGINT,
    CONSTRAINT chk_pending_recovery_amount_positive CHECK (amount > 0)
);

-- Hot path is "what is still owed by this worker", so index only open rows.
CREATE INDEX IF NOT EXISTS idx_pending_recovery_open
    ON payroll_pending_recovery (worker_id)
    WHERE applied_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pending_recovery_source
    ON payroll_pending_recovery (source_type, source_id);

-- Which payslip drove this repayment (NULL = recorded by hand in the Loans UI).
ALTER TABLE loan_repayment_entry
    ADD COLUMN IF NOT EXISTS payroll_id BIGINT;

-- Guards against paying the same payslip twice ever creating two repayment
-- rows for one loan. Partial, so hand-entered repayments stay unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_repayment_payroll
    ON loan_repayment_entry (loan_id, payroll_id)
    WHERE payroll_id IS NOT NULL;
