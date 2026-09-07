-- ============================================================
-- V24 — attendance: lateness detail + offline sync metadata
--
-- Three additive columns. No existing column changes type, nothing is
-- dropped, and every column is nullable, so rows written before this
-- migration stay valid and every existing query keeps working.
--
-- late_minutes
--   How late, not just that they were late. Deliberately NOT a full
--   clock-in/clock-out system: recording the lateness is what lets the AI
--   layer reason about who is persistently irregular and what penalty is
--   proportionate, without redefining what a working day means for payroll.
--   NULL on a present/absent/leave row; NULL on a late row means "late, by an
--   amount nobody recorded", which is different from 0.
--
-- marked_at
--   When the supervisor actually made this mark, as opposed to when the row
--   reached the server. These are different on a phone that was offline for
--   six hours, and the gap is exactly the conflict case: a correction made in
--   the office at noon must not be silently undone by a handset that
--   reconnects at 17:00 still holding the 08:00 mark. The service keeps the
--   NEWER mark and drops the staler one.
--
-- client_uuid already exists (V18) with a partial unique index. It stays the
-- idempotency key for replayed writes.
-- ============================================================

ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS late_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS marked_at    TIMESTAMPTZ;

-- Lateness cannot be negative, and a full day of "lateness" is a data-entry
-- slip rather than a fact worth storing. NOT VALID so the constraint applies
-- to new and updated rows without rewriting the existing table.
ALTER TABLE attendance
    ADD CONSTRAINT chk_attendance_late_minutes
    CHECK (late_minutes IS NULL OR (late_minutes >= 0 AND late_minutes <= 1440))
    NOT VALID;

-- Backfill marked_at from created_at so existing rows have a comparable
-- timestamp. Without this every historical row would look infinitely stale and
-- lose every conflict against a replayed write.
UPDATE attendance SET marked_at = created_at WHERE marked_at IS NULL;

-- The per-worker monthly history screen filters by worker over a date range.
CREATE INDEX IF NOT EXISTS idx_attendance_worker_date
    ON attendance(worker_id, work_date);
