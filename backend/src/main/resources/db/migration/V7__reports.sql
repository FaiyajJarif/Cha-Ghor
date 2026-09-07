-- V7: Reports & Analytics module
-- Creates the `saved_report` table that backs the Reports screen: the estate
-- report snapshots listed in the "Generated Reports" table. The KPI rollups and
-- trend the page shows are computed live from the finance ledger / attendance /
-- workers / loan tables, so this migration only needs the snapshot store.
-- Seeds a few finalized monthly reports (only when the table is empty). Written
-- defensively (same approach as V4-V6) so it is safe whether or not an earlier
-- schema already created this table.

CREATE TABLE IF NOT EXISTS saved_report (
    id           BIGSERIAL PRIMARY KEY,
    title        VARCHAR(160)  NOT NULL DEFAULT '',
    report_type  VARCHAR(30)   NOT NULL DEFAULT 'MONTHLY',
    period_start DATE          NOT NULL DEFAULT CURRENT_DATE,
    period_end   DATE          NOT NULL DEFAULT CURRENT_DATE,
    status       VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
    summary      TEXT,
    revenue      NUMERIC(14,2) NOT NULL DEFAULT 0,
    expense      NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_profit   NUMERIC(14,2) NOT NULL DEFAULT 0,
    generated_by BIGINT,
    generated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    finalized_at TIMESTAMPTZ
);

-- Reconcile columns in case an older saved_report already exists.
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS title        VARCHAR(160)  NOT NULL DEFAULT '';
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS report_type  VARCHAR(30)   NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS period_start DATE          NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS period_end   DATE          NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS status       VARCHAR(20)   NOT NULL DEFAULT 'DRAFT';
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS summary      TEXT;
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS revenue      NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS expense      NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS net_profit   NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS generated_by BIGINT;
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ   NOT NULL DEFAULT now();
ALTER TABLE saved_report ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_saved_report_generated_at ON saved_report (generated_at);

-- If an earlier schema created saved_report.status as a native enum, convert it
-- to VARCHAR so Hibernate @Enumerated(STRING) can store uppercase labels.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saved_report'
      AND column_name = 'status'
      AND udt_name <> 'varchar'
  ) THEN
    ALTER TABLE saved_report ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
    UPDATE saved_report SET status = upper(status) WHERE status ~ '^[a-z]';
  END IF;
END $$;

-- Relax any extra NOT NULL columns an earlier schema may have added that this
-- module never populates. No-op on a fresh DB where V7 created the table.
DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'saved_report'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN (
        'id', 'title', 'report_type', 'period_start', 'period_end',
        'status', 'revenue', 'expense', 'net_profit', 'generated_at'
      )
  LOOP
    EXECUTE format('ALTER TABLE saved_report ALTER COLUMN %I DROP NOT NULL', col);
  END LOOP;
END $$;

-- ---- Seed saved_report (only when empty) ----------------------------------
-- Three finalized monthly reports for the last 3 completed months. Numbers echo
-- the finance seed (revenue 620k; expenses = payroll 185k + fertilizer 115k +
-- logistics 92k + maintenance 69k = 461k; net profit 159k).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM saved_report) THEN
    INSERT INTO saved_report
      (title, report_type, period_start, period_end, status, summary,
       revenue, expense, net_profit, generated_at, finalized_at)
    SELECT
      'Monthly Report - ' || to_char(m, 'FMMonth YYYY'),
      'MONTHLY',
      m::date,
      (m + INTERVAL '1 month - 1 day')::date,
      'FINALIZED',
      'For ' || to_char(m, 'FMMonth YYYY') || ', the estate recorded revenue of BDT 620000 '
        || 'against expenses of BDT 461000, for a net profit of BDT 159000 (margin 25.6%). '
        || 'Payroll cost was BDT 185000. Rolled up from the finance ledger.',
      620000, 461000, 159000,
      (m + INTERVAL '1 month + 2 days'),
      (m + INTERVAL '1 month + 3 days')
    FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '3 months',
                         date_trunc('month', CURRENT_DATE) - INTERVAL '1 month',
                         INTERVAL '1 month') AS m;
  END IF;
END $$;
