-- V23: field status, ground condition and a site photo on zones.
--
-- WHY THESE CANNOT BE DERIVED
--   Yield tells you how a field performed; it does not tell you the field is
--   closed for pruning, or that it is too muddy to send pluckers into after
--   last night's rain. Those are observations a supervisor makes standing in
--   the field, and nothing else in the system can infer them. The Fields screen
--   is built to capture exactly that.
--
-- WHY PLAIN VARCHAR, NOT A POSTGRES ENUM
--   Every native enum in this schema (payroll_status, withdrawal_status,
--   risk_level, attendance_status) has cost time at some point: lowercase
--   labels, "med" not "medium", ADD VALUE migrations, and a view column whose
--   type cannot be changed without dropping the view. A CHECK constraint gives
--   the same protection, reads the same in the app, and can be widened with a
--   one-line ALTER instead of a new enum value.
--
-- Defaults mean every existing zone becomes an active field in good condition,
-- which is the sane starting point for a garden that is already operating.

ALTER TABLE zones ADD COLUMN IF NOT EXISTS status      VARCHAR(20)  NOT NULL DEFAULT 'active';
ALTER TABLE zones ADD COLUMN IF NOT EXISTS condition   VARCHAR(20)  NOT NULL DEFAULT 'good';
ALTER TABLE zones ADD COLUMN IF NOT EXISTS field_note  TEXT;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS photo_url   VARCHAR(300);
ALTER TABLE zones ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ;

-- Constraints are added defensively so this migration stays re-runnable.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_zone_status') THEN
        ALTER TABLE zones ADD CONSTRAINT chk_zone_status
            CHECK (status IN ('active', 'maintenance', 'resting'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_zone_condition') THEN
        ALTER TABLE zones ADD CONSTRAINT chk_zone_condition
            CHECK (condition IN ('good', 'caution', 'poor'));
    END IF;
END $$;

-- The Fields board filters on both, and a garden can have many fields.
CREATE INDEX IF NOT EXISTS idx_zones_status ON zones (status);
