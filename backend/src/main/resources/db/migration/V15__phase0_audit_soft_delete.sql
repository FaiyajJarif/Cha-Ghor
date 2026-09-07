-- ============================================================
-- V15 — Phase 0: append-only audit log + soft deletes
-- ============================================================

-- ---------- append-only audit trail -------------------------
-- Written by an app-side interceptor/AOP aspect (Phase 1 security).
-- Append-only is enforced at the DB grant level: the app role gets INSERT +
-- SELECT only, never UPDATE/DELETE (see Phase 1 grant script).
CREATE TABLE IF NOT EXISTS audit_log (
    id            BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    actor_role    VARCHAR(20),
    action        VARCHAR(20)  NOT NULL,   -- INSERT | UPDATE | DELETE | LOGIN | ...
    entity_type   VARCHAR(60)  NOT NULL,   -- e.g. 'payroll', 'loan', 'withdrawal_request'
    entity_id     BIGINT,
    before_json   JSONB,
    after_json    JSONB,
    ip_address    VARCHAR(45),
    at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_at     ON audit_log(at);

-- ---------- soft delete on financial + worker records -------
-- deleted_at IS NULL  => live row;  NOT NULL => tombstoned.
ALTER TABLE workers            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE loan               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE payroll            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE finance_ledger     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE withdrawal_request ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial indexes so the common "live rows only" scans stay cheap.
CREATE INDEX IF NOT EXISTS idx_workers_live ON workers(id)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_loan_live    ON loan(id)         WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_live ON payroll(id)      WHERE deleted_at IS NULL;
