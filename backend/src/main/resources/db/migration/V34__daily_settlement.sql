-- V34: one row per worker per day, once that day's earnings have been settled.
--
-- ============================================================================
-- WHY THIS TABLE EXISTS
-- ============================================================================
--
-- The estate pays daily. Until now the only moment money moved was a payslip
-- going to `paid`, which made the monthly payslip the payment event. That
-- caused, in order: a payslip paid on the 7th for a period ending on the 31st,
-- which froze the remaining 24 days of work out of payroll forever; an advance
-- that could never be recovered because there was no editable payslip left; and
-- a loan balance that sat unchanged while the worker's screen said ৳20/day was
-- coming off it.
--
-- Recovering daily needs a record of WHICH DAYS HAVE ALREADY BEEN RECOVERED.
-- Without it there are only two outcomes and both are wrong: settle nothing, or
-- settle the same day every time the job runs. DailyLedgerService can compute
-- what a day is worth, but a projection must never be the record of a payment.
-- CLAUDE.md section 1: if a taka moves, there must be a row for it.
--
-- ============================================================================
-- WHAT A ROW MEANS
-- ============================================================================
--
-- "On this date this worker earned `earned`; `to_loan` went to loan balances,
-- `to_advance` went to outstanding advances, and `payable` was added to what
-- the estate owes them." It is a SETTLEMENT, not a payout: no cash leaves here.
-- Cash leaves when the worker withdraws, through withdrawal_request.
--
-- The UNIQUE constraint on (worker_id, work_date) is the whole safety property.
-- Re-running settlement for a day already settled violates it and is skipped,
-- so a double deduction is impossible by construction rather than by careful
-- coding.

CREATE TABLE IF NOT EXISTS daily_settlement (
    id          BIGSERIAL PRIMARY KEY,
    worker_id   BIGINT        NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    work_date   DATE          NOT NULL,

    -- What the wage formula produced for the day, before any recovery.
    earned      NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Where it went. to_loan + to_advance + payable must equal earned; the
    -- CHECK below enforces that rather than trusting the service to.
    to_loan     NUMERIC(12,2) NOT NULL DEFAULT 0,
    to_advance  NUMERIC(12,2) NOT NULL DEFAULT 0,
    payable     NUMERIC(12,2) NOT NULL DEFAULT 0,

    settled_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

    -- Nothing may be negative. A negative recovery would be a payment TO the
    -- worker dressed up as a deduction.
    CONSTRAINT chk_daily_settlement_nonneg
        CHECK (earned >= 0 AND to_loan >= 0 AND to_advance >= 0 AND payable >= 0),

    -- The day's arithmetic must close. If these ever disagree the worker is
    -- being shown one number and paid another, which is the failure this whole
    -- product exists to end.
    CONSTRAINT chk_daily_settlement_balances
        CHECK (to_loan + to_advance + payable = earned),

    -- SETTLE EACH DAY ONCE. This is the idempotency guarantee.
    CONSTRAINT uq_daily_settlement_worker_day UNIQUE (worker_id, work_date)
);

-- "What has this worker accrued, and which days are already done" — the two
-- questions every read asks.
CREATE INDEX IF NOT EXISTS idx_daily_settlement_worker_date
    ON daily_settlement (worker_id, work_date);
