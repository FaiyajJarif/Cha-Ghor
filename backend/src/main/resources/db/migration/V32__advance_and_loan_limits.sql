-- V32: the three borrowing limits, on the existing rate table.
--
-- WHY payroll_config AND NOT A NEW TABLE
--   These are rate knobs in exactly the sense base_daily_wage is: one row per
--   estate, latest effective_from wins, every change audited by the same code
--   path that already audits a wage change. A separate table would need its own
--   history, its own audit call and its own screen for no gain.
--
-- WHAT EACH ONE MEANS
--   advance_cap            most a worker may owe in অগ্রিম at any moment. An
--                          advance is borrowed against days NOT YET WORKED and
--                          is recovered by withholding 100% of daily earnings
--                          until it is clear -- so this number is also, in
--                          effect, "how many days with no pay at all".
--   loan_cap               most a worker may owe in ঋণ.
--   loan_daily_deduction   fixed amount taken from each day's earnings toward a
--                          loan. Unlike an advance this leaves the worker with
--                          the remainder, so they are never left with nothing.
--
-- ORDER OF RECOVERY, recorded here because the numbers are meaningless without
-- it: the loan's daily deduction comes off FIRST, then whatever is left goes to
-- the advance. Set out in section 7 of CLAUDE.md alongside the wage formula.
--
-- Defaults are the values agreed for this estate. NOT NULL with a DEFAULT so
-- the existing config row and any history rows are backfilled in place; no row
-- is rewritten and nothing recomputes.

ALTER TABLE payroll_config
    ADD COLUMN IF NOT EXISTS advance_cap          NUMERIC(12,2) NOT NULL DEFAULT 500.00,
    ADD COLUMN IF NOT EXISTS loan_cap             NUMERIC(12,2) NOT NULL DEFAULT 2000.00,
    ADD COLUMN IF NOT EXISTS loan_daily_deduction NUMERIC(12,2) NOT NULL DEFAULT 20.00;

-- A negative limit would invert every comparison that guards a borrow request:
-- `outstanding < cap` would pass for any outstanding, and a worker could draw
-- without bound. A zero cap is meaningful and allowed -- it switches that kind
-- of borrowing off for the whole estate.
--
-- NOT VALID skips the scan of existing rows; the defaults above already satisfy
-- it, and the check still enforces on every insert and update from now on.
ALTER TABLE payroll_config
    ADD CONSTRAINT chk_payroll_config_limits_nonneg
    CHECK (advance_cap >= 0 AND loan_cap >= 0 AND loan_daily_deduction >= 0)
    NOT VALID;
