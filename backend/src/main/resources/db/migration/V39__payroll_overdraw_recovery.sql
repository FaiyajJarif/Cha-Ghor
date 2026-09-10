-- V39: the fourth deduction reaches the payslip.
--
-- ============================================================================
-- THE BUG THIS FIXES
-- ============================================================================
--
-- V35 gave daily_settlement a fourth destination, to_overdraw: money a worker
-- is repaying because a day they had already been paid for was later corrected
-- downward.
--
-- The payslip was never given a matching column. It carries loan_deduction,
-- advance_recovery and other_deduction, and net_payable is computed as
--
--     gross - loan - advance - other
--
-- so every taka recovered as overdraw was missing from the subtraction. A day
-- earning 235, split 20 loan / 100 advance / 50 overdraw / 65 to the worker,
-- produced a payslip claiming a net of 115 when the worker received 65.
--
-- OVERSTATED BY EXACTLY THE OVERDRAW RECOVERY, on the document a wage dispute
-- is argued from, and only ever visible after a correction had happened -- so
-- it would have stayed hidden until the first argument.
--
-- ============================================================================
-- WHY A STORED COLUMN RATHER THAN SUMMING ON READ
-- ============================================================================
--
-- The other three deductions are stored on the row, so net_payable can be
-- checked against its own components without re-deriving anything. A fourth
-- one computed only at render time would mean the stored net and the displayed
-- deductions disagree for any caller that reads the table directly -- the
-- reports module, the PDF, a SQL query during a dispute.
--
-- Populated by PayrollService.recompute() from SUM(daily_settlement.to_overdraw)
-- for the period, exactly as loan_deduction and advance_recovery already are.
-- It reports what happened; it never forecasts.

ALTER TABLE payroll
    ADD COLUMN IF NOT EXISTS overdraw_recovery NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Same rule as every other money column: direction is carried by the column's
-- meaning, never by a negative number.
ALTER TABLE payroll
    DROP CONSTRAINT IF EXISTS chk_payroll_overdraw_nonneg;
ALTER TABLE payroll
    ADD CONSTRAINT chk_payroll_overdraw_nonneg
        CHECK (overdraw_recovery >= 0);

COMMENT ON COLUMN payroll.overdraw_recovery IS
    'Repayment of wages overpaid on a day that was corrected after settlement. '
    'Summed from daily_settlement.to_overdraw; never hand-entered.';
