-- V36: let a worker or supervisor ASK for an account, and let the office decide.
--
-- ============================================================================
-- WHY A SEPARATE COLUMN AND NOT is_active
-- ============================================================================
--
-- is_active already exists and already blocks login (AppUserDetails.isEnabled),
-- so it is tempting to reuse it: create the account inactive, flip it on
-- approval, done.
--
-- That conflates two different facts. is_active answers "should this account
-- work right now" -- it is how an admin suspends someone who has left, or
-- locks an account during a dispute. approval_status answers "has this person
-- ever been accepted onto the estate". A suspended approved supervisor and a
-- stranger who signed up an hour ago would be indistinguishable, and the
-- pending queue would fill up with people the office deliberately switched off.
--
-- Two columns, two questions. Login requires BOTH: approved and active.
--
-- ============================================================================
-- EVERY EXISTING ROW IS 'approved'
-- ============================================================================
--
-- The DEFAULT plus the backfill below matter more than they look. Without them
-- every existing account -- including the seeded admin -- would land as
-- 'pending' the moment this runs, and there would be nobody able to log in to
-- approve anybody. The system would lock itself out of its own recovery path.

-- NOTE: no full_name column here. users already has display_name (V1) and
-- phone, and an applicant's name belongs in the column that already holds a
-- user's name. A second near-identical column is how two screens end up showing
-- two different names for the same person.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS approval_status   VARCHAR(16) NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS requested_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS decided_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS decided_by        BIGINT,
    ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;

-- Belt and braces: the DEFAULT covers rows added from here on, this covers any
-- row that somehow arrived NULL.
UPDATE users SET approval_status = 'approved' WHERE approval_status IS NULL;

-- VARCHAR + CHECK, not a native enum. V23 wrote down why: a Postgres enum is
-- lower-case, cannot be changed inside a view, and turns a one-line status
-- addition into a migration that drops and recreates every dependent view.
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS chk_users_approval_status;
ALTER TABLE users
    ADD CONSTRAINT chk_users_approval_status
        CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- The queue reads exactly one thing: who is waiting. Partial, because approved
-- accounts are the overwhelming majority and never appear in it.
CREATE INDEX IF NOT EXISTS idx_users_pending_approval
    ON users (requested_at)
    WHERE approval_status = 'pending';

-- A rejected applicant must not silently occupy their username forever with no
-- way to see why. The reason is kept so the office can answer when asked.
COMMENT ON COLUMN users.rejection_reason IS
    'Why an account request was turned down. Shown to the office, not the applicant.';
