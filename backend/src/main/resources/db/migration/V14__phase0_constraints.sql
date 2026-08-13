-- ============================================================
-- V14 — Phase 0: referential + value integrity
--   (1) Wire the shipped `loan` module to a real worker (FK)
--   (2) Non-negative CHECK constraints on all money columns
--   (3) Switch financial worker FKs from CASCADE -> RESTRICT
-- Runs once (Flyway). All DDL here is transactional on Postgres.
-- ============================================================

-- ---------- (1) loan -> worker link -------------------------
-- Decision: keep the shipped denormalized `loan` table, add worker_id,
-- backfill by name. Column is nullable so unmatched legacy rows still load.
ALTER TABLE loan ADD COLUMN IF NOT EXISTS worker_id BIGINT;

-- Backfill: case/space-insensitive match on full_name, then Bangla name_bn.
UPDATE loan l
   SET worker_id = w.id
  FROM workers w
 WHERE l.worker_id IS NULL
   AND lower(btrim(l.worker_name)) = lower(btrim(w.full_name));

UPDATE loan l
   SET worker_id = w.id
  FROM workers w
 WHERE l.worker_id IS NULL
   AND w.name_bn IS NOT NULL
   AND lower(btrim(l.worker_name)) = lower(btrim(w.name_bn));

-- RESTRICT: a worker who has any loan row can't be hard-deleted.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_loan_worker') THEN
    ALTER TABLE loan
      ADD CONSTRAINT fk_loan_worker
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_loan_worker ON loan(worker_id);

-- ---------- (2) money must never be negative ----------------
-- NOT VALID: enforce on all NEW/updated rows immediately without failing the
-- migration on any pre-existing bad data. Run the VALIDATE lines (see README)
-- once you've confirmed legacy rows are clean.
ALTER TABLE workers            ADD CONSTRAINT chk_workers_wage_nonneg    CHECK (daily_wage >= 0) NOT VALID;
ALTER TABLE leaf_collection    ADD CONSTRAINT chk_leaf_weight_nonneg     CHECK (weight_kg >= 0)  NOT VALID;
ALTER TABLE withdrawal_request ADD CONSTRAINT chk_withdrawal_amount_pos  CHECK (amount > 0)      NOT VALID;
ALTER TABLE finance_ledger     ADD CONSTRAINT chk_finance_amount_nonneg  CHECK (amount >= 0)     NOT VALID;
ALTER TABLE loan               ADD CONSTRAINT chk_loan_amounts_nonneg    CHECK (principal >= 0 AND repaid >= 0 AND daily_deduction >= 0) NOT VALID;
ALTER TABLE payroll            ADD CONSTRAINT chk_payroll_amounts_nonneg CHECK (
       base_amount    >= 0 AND surplus_amount   >= 0 AND grade_bonus     >= 0
   AND gross_amount   >= 0 AND loan_deduction   >= 0 AND advance_recovery>= 0
   AND other_deduction>= 0 AND net_payable      >= 0
) NOT VALID;

-- ---------- (3) financial FKs: CASCADE -> RESTRICT ----------
-- Deleting a worker must NOT silently wipe payroll/withdrawal history.
-- We drop the auto-named V1 FK (whatever it's called) and re-add RESTRICT.
-- (attendance + leaf_collection stay CASCADE: they are operational, and soft
--  delete on workers means hard deletes shouldn't happen anyway.)
DO $$
DECLARE c text;
BEGIN
  -- payroll.worker_id
  SELECT con.conname INTO c
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
   WHERE con.conrelid = 'payroll'::regclass AND con.contype = 'f' AND a.attname = 'worker_id'
   LIMIT 1;
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE payroll DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE payroll ADD CONSTRAINT fk_payroll_worker
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE RESTRICT;

  -- withdrawal_request.worker_id
  SELECT con.conname INTO c
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
   WHERE con.conrelid = 'withdrawal_request'::regclass AND con.contype = 'f' AND a.attname = 'worker_id'
   LIMIT 1;
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE withdrawal_request DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE withdrawal_request ADD CONSTRAINT fk_withdrawal_worker
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE RESTRICT;
END $$;
