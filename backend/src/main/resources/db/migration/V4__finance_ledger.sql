-- V4: Finance / Ledger module
-- Creates the estate general ledger table used by the Finance module and seeds a
-- realistic set of demo transactions (only when the table is empty). Written
-- defensively so it is safe whether or not an earlier schema already created
-- finance_ledger.

CREATE TABLE IF NOT EXISTS finance_ledger (
    id           BIGSERIAL PRIMARY KEY,
    entry_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
    ref_id       VARCHAR(40),
    category     VARCHAR(20)   NOT NULL DEFAULT 'EXPENSE',
    account      VARCHAR(160)  NOT NULL DEFAULT '',
    amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    status       VARCHAR(20)   NOT NULL DEFAULT 'SETTLED',
    due_date     DATE,
    note         TEXT,
    source_type  VARCHAR(20),
    source_id    BIGINT,
    created_by   BIGINT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Reconcile columns in case an older finance_ledger already exists.
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS entry_date  DATE          NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS ref_id      VARCHAR(40);
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS category    VARCHAR(20)   NOT NULL DEFAULT 'EXPENSE';
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS account     VARCHAR(160)  NOT NULL DEFAULT '';
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS amount      NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS status      VARCHAR(20)   NOT NULL DEFAULT 'SETTLED';
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS due_date    DATE;
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS note        TEXT;
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS source_type VARCHAR(20);
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS source_id   BIGINT;
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS created_by  BIGINT;
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ   NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_finance_entry_date ON finance_ledger (entry_date);
CREATE INDEX IF NOT EXISTS idx_finance_category   ON finance_ledger (category);
CREATE INDEX IF NOT EXISTS idx_finance_status     ON finance_ledger (status);

-- An earlier schema (V1__init.sql) may have created finance_ledger with extra
-- NOT NULL columns this module never populates (notably `txn_type`). Relax any
-- such NOT NULL column that has no default so the seed below -- and future
-- inserts from the Finance module -- succeed. This is a no-op on a fresh DB
-- where V4 itself created the table.
DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'finance_ledger'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN (
        'id', 'entry_date', 'category', 'account', 'amount', 'status', 'created_at'
      )
  LOOP
    EXECUTE format('ALTER TABLE finance_ledger ALTER COLUMN %I DROP NOT NULL', col);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM finance_ledger) THEN

    -- 6 months of monthly rollups drive the trend chart + expense breakdown.
    -- Revenue: one bulk sale per month.
    INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
    SELECT (m + INTERVAL '9 days')::date, 'TXN-' || to_char(m, 'YYMM') || '01',
           'REVENUE', 'Bulk Tea Sales', 620000, 'SETTLED'
    FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                         date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

    -- Wages (payroll) ~ 40% of monthly spend.
    INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
    SELECT (m + INTERVAL '26 days')::date, 'PAY-' || to_char(m, 'YYMM') || '01',
           'PAYROLL', 'Field Wages', 185000, 'SETTLED'
    FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                         date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

    -- Fertilizer ~ 25%.
    INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
    SELECT (m + INTERVAL '12 days')::date, 'INV-' || to_char(m, 'YYMM') || '01',
           'EXPENSE', 'Fertilizer', 115000, 'SETTLED'
    FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                         date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

    -- Logistics ~ 20%.
    INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
    SELECT (m + INTERVAL '15 days')::date, 'LOG-' || to_char(m, 'YYMM') || '01',
           'EXPENSE', 'Logistics', 92000, 'SETTLED'
    FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                         date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

    -- Maintenance ~ 15%.
    INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status)
    SELECT (m + INTERVAL '18 days')::date, 'MNT-' || to_char(m, 'YYMM') || '01',
           'EXPENSE', 'Maintenance', 69000, 'SETTLED'
    FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                         date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m;

    -- A handful of recent, individually-visible ledger rows (this month).
    INSERT INTO finance_ledger (entry_date, ref_id, category, account, amount, status, due_date) VALUES
      (CURRENT_DATE,     'TXN-98671', 'REVENUE', 'Outlet Sales',    12500, 'SETTLED', NULL),
      (CURRENT_DATE - 1, 'TXN-98210', 'REVENUE', 'Local Market',   145000, 'SETTLED', NULL),
      (CURRENT_DATE - 1, 'UTL-00421', 'EXPENSE', 'Electricity',     28400, 'SETTLED', NULL),
      (CURRENT_DATE - 2, 'MISC-9902', 'EXPENSE', 'Staff Training',  14200, 'SETTLED', NULL),
      -- Pending items feed the "Payables due (7 days)" and "Overdue" cards.
      (CURRENT_DATE - 2, 'INV-12908', 'EXPENSE', 'Chemicals',       64000, 'PENDING', CURRENT_DATE + 4),
      (CURRENT_DATE - 3, 'MNT-55091', 'EXPENSE', 'Vehicle Repair',   8200, 'PENDING', CURRENT_DATE + 6),
      (CURRENT_DATE - 5, 'LNO-44590', 'LOAN',    'Equip. Finance',  27000, 'PENDING', CURRENT_DATE - 3);

  END IF;
END $$;
