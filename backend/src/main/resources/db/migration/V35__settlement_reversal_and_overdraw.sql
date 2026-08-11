-- V35: let a settled day be CORRECTED without destroying the record of what
-- was originally settled, and track money a worker drew against a day that
-- later turned out to be worth less.
--
-- ============================================================================
-- WHY REVERSAL AND NOT DELETE
-- ============================================================================
--
-- A supervisor mis-keys a weight, settlement runs overnight, and the next
-- morning the weigh-in is corrected. By then real balances have moved:
-- loan.repaid went up and a loan_in row hit finance_ledger.
--
-- The tempting fix is to delete the settlement row and settle the day again.
-- That is wrong for the reason this whole product exists: if a taka moved,
-- there must be a row for it. Deleting the evidence of a repayment that really
-- happened leaves a loan balance nobody can explain, and it is indistinguishable
-- from someone quietly removing an inconvenient number.
--
-- So a corrected day is REVERSED, not erased. The original row stays, stamped
-- with when and why. A compensating ledger entry undoes the money. Then the day
-- is settled again from scratch, and both rows are visible side by side.
--
-- ============================================================================
-- THE PARTIAL UNIQUE INDEX IS THE WHOLE TRICK
-- ============================================================================
--
-- V34 enforced "settle each day once" with UNIQUE (worker_id, work_date). That
-- is exactly what makes re-settling a corrected day impossible.
--
-- Replacing it with a UNIQUE index that only covers rows WHERE reversed_at IS
-- NULL keeps the guarantee that matters -- at most one LIVE settlement per
-- worker per day, so a repeated job run still cannot deduct twice -- while
-- allowing any number of reversed rows to accumulate as history.

-- ---------------------------------------------------------------------------
-- 1. daily_settlement: reversal
-- ---------------------------------------------------------------------------

ALTER TABLE daily_settlement
    ADD COLUMN IF NOT EXISTS reversed_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

-- The V34 constraint has to go, or a corrected day can never be re-settled.
ALTER TABLE daily_settlement
    DROP CONSTRAINT IF EXISTS uq_daily_settlement_worker_day;

-- One LIVE settlement per worker per day. Reversed rows are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_settlement_live_day
    ON daily_settlement (worker_id, work_date)
    WHERE reversed_at IS NULL;

-- "Show me what was corrected" is a question the office will ask.
CREATE INDEX IF NOT EXISTS idx_daily_settlement_reversed
    ON daily_settlement (worker_id, reversed_at)
    WHERE reversed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. loan_repayment_entry: reversal, and a link back to the day
-- ---------------------------------------------------------------------------

-- chk_loan_repayment_amount_pos (V19) forbids a negative amount, and rightly:
-- a negative repayment is a payment TO the worker wearing a disguise. So a
-- reversal is recorded by STAMPING the original row, not by inserting a
-- mirror-image one.
ALTER TABLE loan_repayment_entry
    ADD COLUMN IF NOT EXISTS reversed_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

-- Which settled day produced this repayment. Without it a reversal has to guess
-- from the date, and guessing is how the wrong repayment gets undone.
--
-- No FK: settlement rows are never deleted, and the rest of this schema keeps
-- foreign keys as plain Long columns resolved in the service layer.
ALTER TABLE loan_repayment_entry
    ADD COLUMN IF NOT EXISTS settlement_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_loan_repayment_settlement
    ON loan_repayment_entry (settlement_id)
    WHERE settlement_id IS NOT NULL;

-- A live repayment is one that has not been reversed. Sums that drive a balance
-- must filter on this.
CREATE INDEX IF NOT EXISTS idx_loan_repayment_live
    ON loan_repayment_entry (loan_id)
    WHERE reversed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. wage_overdraw: money the worker has that is no longer theirs
-- ---------------------------------------------------------------------------
--
-- A day settled at ৳215, the worker withdrew it, and the weigh-in was then
-- corrected down to ৳150. The ৳65 difference is already in his bKash.
--
-- Nothing is clawed back. No cash is demanded from a tea plucker because an
-- office record changed. Instead the ৳65 is carried as a debt and recovered
-- from future earnings exactly as an advance is -- which keeps the books true
-- without anyone knocking on a door.
--
-- It is deliberately a SEPARATE table from advances, not a synthetic advance
-- row: an advance is something the worker asked for, and an overdraw is
-- something the estate got wrong. Merging them would hide the estate's own
-- error rate inside the workers' borrowing figures, and would make the ৳500
-- advance cap unenforceable.

CREATE TABLE IF NOT EXISTS wage_overdraw (
    id            BIGSERIAL PRIMARY KEY,
    worker_id     BIGINT        NOT NULL REFERENCES workers(id) ON DELETE CASCADE,

    -- How much the worker was overpaid, and how much has since been worked off.
    amount        NUMERIC(12,2) NOT NULL,
    recovered     NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- The day whose correction caused this.
    work_date     DATE          NOT NULL,
    settlement_id BIGINT,

    reason        TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

    -- Same rule as finance_ledger: no negative amounts anywhere. A negative
    -- overdraw would be the estate owing the worker, which is not this table.
    CONSTRAINT chk_wage_overdraw_nonneg
        CHECK (amount >= 0 AND recovered >= 0),

    -- Cannot recover more than was overpaid.
    CONSTRAINT chk_wage_overdraw_not_over
        CHECK (recovered <= amount)
);

-- "What does this worker still owe from corrections" — the only question the
-- daily split asks of this table.
CREATE INDEX IF NOT EXISTS idx_wage_overdraw_worker
    ON wage_overdraw (worker_id)
    WHERE recovered < amount;

-- ---------------------------------------------------------------------------
-- 4. daily_settlement: where an overdraw recovery went
-- ---------------------------------------------------------------------------
--
-- The V34 CHECK is earned = to_loan + to_advance + payable. Adding a fourth
-- destination means that identity has to be restated, or every settlement with
-- an overdraw recovery would be rejected by the database.
--
-- Recovery order is loan, then advance, then overdraw, then the worker.
-- Overdraw sits AFTER advance on purpose: an advance was money the worker
-- asked for and is counting on clearing, while an overdraw is the estate's own
-- correction. Putting the estate's mistake ahead of the worker's plan would
-- extend his zero-pay stretch for a reason he had no part in.

ALTER TABLE daily_settlement
    ADD COLUMN IF NOT EXISTS to_overdraw NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE daily_settlement
    DROP CONSTRAINT IF EXISTS chk_daily_settlement_nonneg;
ALTER TABLE daily_settlement
    ADD CONSTRAINT chk_daily_settlement_nonneg
        CHECK (earned >= 0 AND to_loan >= 0 AND to_advance >= 0
               AND to_overdraw >= 0 AND payable >= 0);

ALTER TABLE daily_settlement
    DROP CONSTRAINT IF EXISTS chk_daily_settlement_balances;
ALTER TABLE daily_settlement
    ADD CONSTRAINT chk_daily_settlement_balances
        CHECK (to_loan + to_advance + to_overdraw + payable = earned);
