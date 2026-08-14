-- V6: Loans & Advances module
-- Creates the worker loan ledger (`loan`) that backs the Loan Management
-- screen: the pending request queue, the active repayments table, and the five
-- KPI cards. Seeds realistic demo data only when the table is empty. Written
-- defensively (same approach as V4 / V5) so it is safe whether or not an
-- earlier schema already created this table with extra NOT NULL columns.

CREATE TABLE IF NOT EXISTS loan (
    id              BIGSERIAL PRIMARY KEY,
    reference       VARCHAR(40),
    worker_name     VARCHAR(120)  NOT NULL DEFAULT '',
    zone            VARCHAR(20),
    avatar_url      TEXT,
    principal       NUMERIC(12,2) NOT NULL DEFAULT 0,
    reason          VARCHAR(200),
    repaid          NUMERIC(12,2) NOT NULL DEFAULT 0,
    daily_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    requested_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    decided_at      TIMESTAMPTZ,
    decided_by      BIGINT
);

ALTER TABLE loan ADD COLUMN IF NOT EXISTS reference       VARCHAR(40);
ALTER TABLE loan ADD COLUMN IF NOT EXISTS worker_name     VARCHAR(120)  NOT NULL DEFAULT '';
ALTER TABLE loan ADD COLUMN IF NOT EXISTS zone            VARCHAR(20);
ALTER TABLE loan ADD COLUMN IF NOT EXISTS avatar_url      TEXT;
ALTER TABLE loan ADD COLUMN IF NOT EXISTS principal       NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE loan ADD COLUMN IF NOT EXISTS reason          VARCHAR(200);
ALTER TABLE loan ADD COLUMN IF NOT EXISTS repaid          NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE loan ADD COLUMN IF NOT EXISTS daily_deduction NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE loan ADD COLUMN IF NOT EXISTS status          VARCHAR(20)   NOT NULL DEFAULT 'PENDING';
ALTER TABLE loan ADD COLUMN IF NOT EXISTS requested_at    TIMESTAMPTZ   NOT NULL DEFAULT now();
ALTER TABLE loan ADD COLUMN IF NOT EXISTS decided_at      TIMESTAMPTZ;
ALTER TABLE loan ADD COLUMN IF NOT EXISTS decided_by      BIGINT;

CREATE INDEX IF NOT EXISTS idx_loan_status ON loan (status);

-- If an earlier schema created `loan.status` as a native enum, convert it to
-- VARCHAR so Hibernate @Enumerated(STRING) can store uppercase labels.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loan'
      AND column_name = 'status'
      AND udt_name <> 'varchar'
  ) THEN
    ALTER TABLE loan ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
    UPDATE loan SET status = upper(status) WHERE status ~ '^[a-z]';
  END IF;
END $$;

-- Relax any extra NOT NULL columns an earlier schema may have added that this
-- module never populates. No-op on a fresh DB where V6 created the table.
DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'loan'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN (
        'id', 'worker_name', 'principal', 'repaid', 'daily_deduction',
        'status', 'requested_at'
      )
  LOOP
    EXECUTE format('ALTER TABLE loan ALTER COLUMN %I DROP NOT NULL', col);
  END LOOP;
END $$;

-- ---- Seed loan (only when empty) ------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM loan) THEN
    -- Pending requests feed the queue + PENDING KPI (no reference yet).
    INSERT INTO loan (worker_name, zone, principal, reason, daily_deduction, status, requested_at) VALUES
      ('Zawad',  'A1', 3000, 'Medical Emergency (Hospitalization)', 15, 'PENDING', now() - INTERVAL '10 minutes'),
      ('Adil',   'A4', 2000, 'School Supplies (Secondary Level)',   10, 'PENDING', now() - INTERVAL '1 hour'),
      ('Rafiq',  'B1', 1500, 'Home repair after storm damage',      10, 'PENDING', now() - INTERVAL '3 hours'),
      ('Shuvo',  'C2', 5000, 'Wedding expenses',                    20, 'PENDING', now() - INTERVAL '6 hours'),
      ('Nabila', 'A2', 2500, 'Medical checkup for child',           12, 'PENDING', now() - INTERVAL '1 day'),
      ('Karim',  'B3', 1800, 'Bicycle for commute',                 10, 'PENDING', now() - INTERVAL '2 days');

    -- Active loans (ON TRACK) feed the repayments table + ACTIVE KPI.
    INSERT INTO loan (reference, worker_name, zone, principal, repaid, daily_deduction, status, requested_at, decided_at) VALUES
      ('L-2026-101', 'Mukarram', 'A3', 4000,  2000, 10, 'ACTIVE', now() - INTERVAL '40 days', now() - INTERVAL '30 days'),
      ('L-2026-102', 'Sabbir',   'A3', 6000,  3200, 10, 'ACTIVE', now() - INTERVAL '35 days', now() - INTERVAL '28 days'),
      ('L-2026-103', 'Tania',    'B2', 12000, 500,  10, 'ACTIVE', now() - INTERVAL '20 days', now() - INTERVAL '15 days'),
      ('L-2026-104', 'Jamil',    'C1', 3000,  2400, 15, 'ACTIVE', now() - INTERVAL '25 days', now() - INTERVAL '20 days'),
      ('L-2026-105', 'Farhana',  'A1', 8000,  6000, 20, 'ACTIVE', now() - INTERVAL '50 days', now() - INTERVAL '45 days'),
      ('L-2026-106', 'Imran',    'B1', 5000,  1500, 12, 'ACTIVE', now() - INTERVAL '18 days', now() - INTERVAL '12 days');

    -- Overdue loans feed the OVERDUE KPI + red pill.
    INSERT INTO loan (reference, worker_name, zone, principal, repaid, daily_deduction, status, requested_at, decided_at) VALUES
      ('L-2026-091', 'Bappi', 'C3', 7000, 800,  10, 'OVERDUE', now() - INTERVAL '70 days', now() - INTERVAL '60 days'),
      ('L-2026-092', 'Lipi',  'A4', 4500, 1200, 10, 'OVERDUE', now() - INTERVAL '65 days', now() - INTERVAL '55 days');

    -- Fully repaid loans feed the RECOVERED KPI (sum of repaid).
    INSERT INTO loan (reference, worker_name, zone, principal, repaid, daily_deduction, status, requested_at, decided_at) VALUES
      ('L-2026-071', 'Hasan', 'A2', 3000, 3000, 10, 'REPAID', now() - INTERVAL '120 days', now() - INTERVAL '110 days'),
      ('L-2026-072', 'Momin', 'B2', 5000, 5000, 15, 'REPAID', now() - INTERVAL '130 days', now() - INTERVAL '120 days'),
      ('L-2026-073', 'Ruma',  'C1', 2000, 2000, 10, 'REPAID', now() - INTERVAL '100 days', now() - INTERVAL '95 days'),
      ('L-2026-074', 'Selim', 'A3', 4000, 4000, 10, 'REPAID', now() - INTERVAL '140 days', now() - INTERVAL '135 days');
  END IF;
END $$;
