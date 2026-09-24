-- V42: close the legacy payroll_pending_recovery rows.
--
-- ============================================================================
-- WHY THESE ARE NOT DELETED
-- ============================================================================
--
-- payroll_pending_recovery parked an advance when the OLD MONTHLY model had no
-- editable payslip to net it off. Nothing has written to it since the estate
-- moved to daily settlement -- verified: PayrollService has zero save/builder
-- calls against it, only the one read that feeds the Payroll banner.
--
-- So the rows are inert. The tempting fix is DELETE. It is the wrong one:
--
--   * §1 -- "If a taka moves, there must be a row for it." Each of these rows
--     records an advance that really was handed to a real worker. The advance
--     happened; deleting the row does not un-happen it, it only removes the
--     evidence.
--   * §7.4 -- "Corrections are reversals, never deletions." The entire ledger
--     design is built on that, and a table about money that went missing is the
--     last place to make an exception.
--   * The open question these rows answer is "why was this worker's advance
--     recovered in April". After a DELETE that question has no answer at all.
--
-- Marking them closed achieves exactly the same visible outcome -- the banner
-- reads findByAppliedAtIsNull, so a stamped row disappears from it -- while the
-- history survives AND now explains itself to whoever finds it next.
--
-- ============================================================================
-- WHAT applied_at MEANS HERE
-- ============================================================================
--
-- Ordinarily applied_at means "a payslip absorbed this". Here it means "this no
-- longer needs absorbing, because daily settlement already recovers the same
-- advance from the withdrawal row itself". The note says so on every row, in
-- full sentences, because a bare timestamp would look like the amount had been
-- deducted a second time -- which is precisely the double-recovery this is
-- meant to prevent.
--
-- payroll_id is deliberately left NULL: no payslip absorbed these, and writing
-- an id would be inventing a link that does not exist.

UPDATE payroll_pending_recovery
   SET applied_at = now(),
       note = COALESCE(NULLIF(note, ''), 'legacy advance') ||
              ' | Closed by V42: superseded by daily settlement. The same advance'
              ' is recovered from the worker''s withdrawal row day by day, so this'
              ' parked entry is history, not outstanding debt. It was NOT deducted'
              ' a second time.'
 WHERE applied_at IS NULL;

COMMENT ON TABLE payroll_pending_recovery IS
    'LEGACY, closed by V42. Advances parked by the old monthly model when there '
    'was no editable payslip to net them against. Nothing writes here any more — '
    'daily settlement recovers an advance from the withdrawal row directly. Kept '
    'read-only for audit; do not resurrect as a source of outstanding debt.';
