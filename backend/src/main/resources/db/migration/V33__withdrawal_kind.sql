-- V33: tell a wage withdrawal apart from an advance.
--
-- WHY THIS COLUMN HAS TO EXIST
--   Both are cash leaving before the payslip settles, so both were written as
--   identical `withdrawal_request` rows. They are not the same thing:
--
--     salary   money the worker HAS ALREADY EARNED, released early. Not a debt.
--              Nothing is owed and nothing is recovered from future work.
--     advance  money against days NOT YET WORKED. A debt, capped by
--              payroll_config.advance_cap, repaid by withholding every taka the
--              worker earns from the payout date until it clears.
--
--   Without the distinction three things were wrong at once: the admin queue
--   could not show which was which, a pending WAGE withdrawal blocked an
--   ADVANCE request while claiming "your advance request is pending", and the
--   daily ledger counted a wage release as a debt.
--
-- VARCHAR + CHECK, not a native Postgres enum. V23 wrote down why and V28
-- retired one of the remaining enums for the same reason: a native enum's
-- labels are lowercase, cannot be altered inside a transaction, and a view
-- column's type cannot be changed away from it without dropping the view.
--
-- DEFAULT 'advance' for the backfill. Every row that existed before this
-- migration was created by the advance flow -- the wage-withdrawal path is new
-- in this change and has never written a row. Backfilling to 'salary' would
-- retroactively erase real debts.

ALTER TABLE withdrawal_request
    ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'advance';

ALTER TABLE withdrawal_request
    ADD CONSTRAINT chk_withdrawal_kind
    CHECK (kind IN ('salary', 'advance'))
    NOT VALID;

-- The daily ledger asks "which advances are still being repaid, and from what
-- date", per worker, on every load of the worker's money screen.
CREATE INDEX IF NOT EXISTS idx_withdrawal_worker_kind_status
    ON withdrawal_request (worker_id, kind, status);
