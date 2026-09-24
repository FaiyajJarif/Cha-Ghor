-- V40: reclassify advances already in the ledger from EXPENSE to RECEIVABLE.
--
-- ============================================================================
-- WHAT WAS WRONG
-- ============================================================================
--
-- Every worker withdrawal posted as category PAYROLL with source_type
-- 'withdrawal', whether it was wages or an advance. An advance is not a cost --
-- it is money lent against work not yet done, recovered by paying smaller
-- wages later.
--
-- So totalExpenses, and therefore netProfit, the profit margin and the Overview
-- health score, all overstated the estate's costs by every taka of advance
-- still outstanding. The estate looked less profitable than it was, on the
-- screen an owner uses to decide whether the season worked.
--
-- Going forward WithdrawalService routes by kind. This fixes the rows already
-- written.
--
-- ============================================================================
-- WHY THE JOIN, AND WHY IT IS SAFE
-- ============================================================================
--
-- The ledger row does not record whether it was wages or an advance; only
-- withdrawal_request.kind knows (added in V33). So the rows are matched back
-- through source_id.
--
-- V33 BACKFILLED kind='advance' FOR EVERY PRE-EXISTING WITHDRAWAL, because
-- backfilling to 'salary' would have erased real debts. That means some rows
-- reclassified here may have been genuine wage payouts from before the
-- distinction existed. The consequence is bounded and in the safe direction:
-- those amounts move out of expenses and into the LOAN category, so the
-- estate's reported cost drops rather than a debt being forgotten. Cash on
-- hand is unaffected either way -- both categories reduce it.
--
-- No amounts change. No rows are inserted or deleted. Only the label moves.

UPDATE finance_ledger f
SET category    = 'LOAN',
    source_type = 'advance_out',
    ref_id      = COALESCE('ADV-' || f.source_id, f.ref_id),
    note        = 'Advance against future wages (bKash)'
FROM withdrawal_request w
WHERE f.source_type = 'withdrawal'
  AND f.source_id   = w.id
  AND w.kind        = 'advance';

-- Wage withdrawals keep source_type 'withdrawal' and category PAYROLL, which
-- was already correct. Nothing to do for them.

-- "Which advances are on the books" is now a question the ledger can answer.
CREATE INDEX IF NOT EXISTS idx_finance_advance
    ON finance_ledger (source_type, source_id)
    WHERE source_type IN ('advance_out', 'advance_in');

-- ============================================================================
-- WHAT THIS MIGRATION DOES NOT DO
-- ============================================================================
--
-- It does not create the matching 'advance_in' expense rows for advances that
-- were already partly worked off before this change. Those recoveries happened
-- in daily_settlement without a ledger counterpart, so the wage expense for
-- that work was never recorded anywhere -- it was double-counted at payout
-- instead, which the UPDATE above has just removed.
--
-- Reconstructing them would mean inventing ledger rows for money that moved
-- before the rule existed, and this system does not invent rows. The effect is
-- that historic expense is understated by the amount of advance recovered
-- before today. Settlements from now on record it correctly.
