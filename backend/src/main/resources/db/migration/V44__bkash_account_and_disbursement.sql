-- V44: a company bKash wallet, and batched disbursement to workers.
--
-- ============================================================================
-- THE ACCOUNTING PROBLEM THIS SOLVES
-- ============================================================================
--
-- cashOnHand is one rollup over finance_ledger: REVENUE adds, EVERYTHING ELSE
-- subtracts (see FinanceRepository.summary). So if funding the bKash wallet
-- posted as an ordinary ledger row, cash would fall by the top-up amount when
-- the wallet was funded -- and fall AGAIN when wages were paid out of it. The
-- same taka counted out twice.
--
-- Money does not leave the estate when it moves from the office to the estate's
-- own wallet. It leaves when it reaches a worker.
--
-- ============================================================================
-- THE MODEL: ONE FIGURE, TWO POCKETS
-- ============================================================================
--
--   Cash on Hand  =  office cash  +  bKash wallet balance
--
--   top-up        transfer between pockets. Ledger row EXISTS (§1: if a taka
--                 moves there is a row) but contributes ZERO to cashOnHand.
--                 bkash_account.balance goes UP.
--
--   disbursement  the wage payment posts exactly as it does today, through
--                 FinanceService.postWithdrawal / postAdvance, and reduces
--                 cashOnHand. bkash_account.balance goes DOWN by the same
--                 amount.
--
-- Net effect: cash falls once, when the worker is paid. The wallet balance is
-- the part of that cash currently sitting at bKash rather than in the office.
-- Nothing about existing payroll or withdrawal posting changes.
--
-- The cash-neutral arm is added to the summary query in FinanceRepository, NOT
-- here; this migration only creates the tables and the source_type it keys on.

-- ---------------------------------------------------------------------------
-- 1. the wallet
-- ---------------------------------------------------------------------------
-- Single row, id = 1, same shape as app_setting. One estate, one disbursement
-- account -- exactly how a corporate bKash arrangement works.
CREATE TABLE IF NOT EXISTS bkash_account (
    id             BIGINT PRIMARY KEY DEFAULT 1,
    wallet_number  VARCHAR(20)    NOT NULL DEFAULT '01700000000',
    -- The balance is DERIVED from top-ups minus disbursements, but stored so
    -- the wallet screen is one read rather than a rollup on every page load.
    -- BkashService is the only writer and adjusts it in the same transaction
    -- as the rows that justify it.
    balance        NUMERIC(14,2)  NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT chk_bkash_single_row     CHECK (id = 1),
    -- A wallet cannot go overdrawn. bKash would simply refuse the run, and a
    -- negative balance here would be a silent lie about available funds.
    CONSTRAINT chk_bkash_balance_nonneg CHECK (balance >= 0)
);

INSERT INTO bkash_account (id, wallet_number, balance)
VALUES (1, '01700000000', 0)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. a disbursement run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disbursement_batch (
    id           BIGSERIAL PRIMARY KEY,
    reference    VARCHAR(40)   NOT NULL UNIQUE,
    status       VARCHAR(16)   NOT NULL DEFAULT 'draft',
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    item_count   INTEGER       NOT NULL DEFAULT 0,
    created_by   BIGINT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    sent_at      TIMESTAMPTZ,
    CONSTRAINT chk_batch_status CHECK (status IN ('draft', 'sent', 'cancelled')),
    CONSTRAINT chk_batch_total_nonneg CHECK (total_amount >= 0)
);

CREATE TABLE IF NOT EXISTS disbursement_item (
    id            BIGSERIAL PRIMARY KEY,
    batch_id      BIGINT        NOT NULL REFERENCES disbursement_batch(id) ON DELETE CASCADE,
    -- The withdrawal request this pays. UNIQUE so the same request cannot be
    -- placed in two batches and paid twice -- the database refuses rather than
    -- relying on the UI to be careful.
    withdrawal_id BIGINT        NOT NULL UNIQUE,
    worker_id     BIGINT        NOT NULL,
    phone         VARCHAR(20)   NOT NULL,
    amount        NUMERIC(14,2) NOT NULL,
    status        VARCHAR(16)   NOT NULL DEFAULT 'queued',
    -- The bKash transaction id. THIS is what makes a payout auditable against a
    -- statement; without it "paid" is an unverifiable assertion.
    trx_id        VARCHAR(40),
    sent_at       TIMESTAMPTZ,
    CONSTRAINT chk_item_status CHECK (status IN ('queued', 'sent', 'failed')),
    CONSTRAINT chk_item_amount_pos CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_disbursement_item_batch ON disbursement_item (batch_id);
CREATE INDEX IF NOT EXISTS idx_disbursement_batch_status ON disbursement_batch (status, created_at DESC);

COMMENT ON TABLE bkash_account IS
    'The estate''s corporate bKash disbursement wallet. Balance is part of Cash '
    'on Hand, not separate from it: a top-up is a transfer between the office '
    'and this wallet and costs nothing. Money leaves the estate when a worker '
    'is paid, which posts through FinanceService as it always has.';

COMMENT ON TABLE disbursement_batch IS
    'One bulk payout run: the spreadsheet a corporate bKash arrangement is fed. '
    'draft = built and exportable, sent = executed and paid.';
