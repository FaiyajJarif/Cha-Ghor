-- V31: the columns the worker console needs.
--
-- Two unrelated additions in one migration because they land together with the
-- same feature; splitting them would leave V31 and V32 that must be applied as
-- a pair anyway.
--
-- Append-only. V30 was the last applied migration.

-- ---------------------------------------------------------------- workers

-- The worker's own profile card shows this. It had no column, and the first
-- draft of the screen simply displayed a value that came from nowhere.
--
-- VARCHAR + CHECK rather than a native enum, per the rule V23 wrote down.
-- Nullable on purpose: this is a field the office may not have recorded, and
-- defaulting every existing worker to a guess would put wrong data on their own
-- profile page -- the one screen where a worker is most likely to notice, and
-- least able to correct.
ALTER TABLE workers ADD COLUMN IF NOT EXISTS gender VARCHAR(10);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_worker_gender') THEN
        ALTER TABLE workers ADD CONSTRAINT chk_worker_gender
            CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'));
    END IF;
END $$;

-- ------------------------------------------------------------- field_case

-- CONFIDENTIAL, NOT ANONYMOUS -- and the difference is the whole design.
--
-- submitted_by and submitter_name are still written. An estate has to be able to
-- investigate an abuse of this channel, and a grievance system with no
-- accountability at all is one that never gets switched on.
--
-- What this flag changes is EXPOSURE: when true, no API response and no screen
-- returns the submitter. CaseResponse nulls both fields and the admin list shows
-- "গোপনীয় অভিযোগ" where a name would be.
--
-- The Bangla promise on the form -- "আপনার পরিচয় প্রশাসনের কাছে গোপন রাখা হবে"
-- -- is true under that design. What must never be claimed is that the identity
-- is not recorded. A worker raising a grievance about their own supervisor is
-- exactly who this is for, and one broken promise ends its usefulness for good.
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS confidential BOOLEAN NOT NULL DEFAULT false;

-- When the thing happened, as opposed to when it was reported. A worker who
-- files on Thursday about Monday's incident should not have the case read as
-- Thursday's.
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS incident_date DATE;

-- Offline idempotency, same shape as V18 and V29. A complaint written in a dead
-- spot queues in the outbox; without this a replay files it twice, and two
-- copies of the same grievance is exactly the noise that makes a channel look
-- untrustworthy.
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS client_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_field_case_client_uuid
    ON field_case(client_uuid) WHERE client_uuid IS NOT NULL;

-- The worker console reads "my cases" on every load.
CREATE INDEX IF NOT EXISTS idx_field_case_submitted_by ON field_case (submitted_by);
