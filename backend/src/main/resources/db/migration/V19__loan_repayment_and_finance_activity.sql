-- V19: Loan repayment recording + Finance activity feed support.
--
-- Two problems this fixes:
--  1. `loan.repaid` was never incremented by any code path, so the "Recovered"
--     KPI and every progress bar were permanently stuck at zero. There was no
--     table to record an individual repayment against the module's `loan` table
--     (V1's legacy `loan_repayment` points at the old `loans` table, not this
--     one), so we add a dedicated one.
--  2. The Finance activity feed filters finance_ledger by source_type, which
--     had no index.

CREATE TABLE IF NOT EXISTS loan_repayment_entry (
    id           BIGSERIAL PRIMARY KEY,
    loan_id      BIGINT        NOT NULL REFERENCES loan(id) ON DELETE CASCADE,
    amount       NUMERIC(14,2) NOT NULL,
    paid_on      DATE          NOT NULL DEFAULT CURRENT_DATE,
    note         TEXT,
    recorded_by  BIGINT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_loan_repayment_amount_pos CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_loan_repayment_loan ON loan_repayment_entry (loan_id);
CREATE INDEX IF NOT EXISTS idx_finance_source_type ON finance_ledger (source_type);

-- The activity feed and the idempotency guard both look up (source_type, source_id).
CREATE INDEX IF NOT EXISTS idx_finance_source ON finance_ledger (source_type, source_id);
