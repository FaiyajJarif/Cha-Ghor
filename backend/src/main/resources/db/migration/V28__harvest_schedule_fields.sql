-- V28: make harvest_schedule usable.
--
-- WHY THIS EXISTS
--   harvest_schedule has been in the schema since V1 and has never had a line
--   of Java behind it. The Fields board grew a "Create Harvest Schedule" form
--   anyway, which built objects in React state with ids like `local-1733...`
--   and lost them on reload. The form and the table also disagreed about what a
--   schedule IS, in four ways, all of which had to be settled before a single
--   row could be inserted:
--
--     1. The form collects no DATE. sched_date is NOT NULL, so nothing the form
--        produced could ever have been stored. The section is titled "Upcoming
--        Harvest Schedule" while its first column reads "Created" -- there was
--        no way to plan work for Thursday. The date input is being added on the
--        frontend; the column was always here waiting for it.
--     2. The form assigns a WORKER by typing a name into a datalist. The table
--        has supervisor_id (a users FK) and no worker column at all. Both are
--        wanted -- the worker who does the job, the supervisor who owns it --
--        so worker_id is added as a real FK and the free-text box becomes a
--        picker. A name typed by hand is the loan.worker_name mistake again:
--        it looks linked and is not.
--     3. The form emits status 'draft'. schedule_status is ENUM('planned','done')
--        and would have thrown `invalid input value for enum schedule_status`.
--     4. expected kg, description, attachment and schedule type had nowhere to go.
--
-- WHY THE NATIVE ENUM IS BEING RETIRED HERE
--   V23 wrote down the house rule and the reasoning: every native enum in this
--   schema has cost time -- lowercase labels, "med" not "medium", ADD VALUE
--   migrations, and a view column whose type cannot be altered without dropping
--   the view. A CHECK gives identical protection and widens with one line.
--   schedule_status is used by exactly ONE column, in ONE table, which has never
--   held a row (no seed data, no application code). Converting it now is free;
--   converting it later, with a year of schedules in it, would not be.
--
--   The TYPE itself is deliberately NOT dropped. It is inert once unreferenced,
--   and dropping types is the kind of irreversible tidying that belongs in its
--   own migration rather than riding along with a feature.
--
-- Append-only. V27 was the last applied migration.

-- ---------------------------------------------------------------- new columns

-- The worker who does the work. ON DELETE SET NULL, not CASCADE: retiring a
-- worker must not silently erase the record that the work was planned.
ALTER TABLE harvest_schedule ADD COLUMN IF NOT EXISTS worker_id      BIGINT REFERENCES workers(id) ON DELETE SET NULL;

ALTER TABLE harvest_schedule ADD COLUMN IF NOT EXISTS expected_kg    NUMERIC(10,2);
ALTER TABLE harvest_schedule ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE harvest_schedule ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(400);

-- daily | weekly | one-off | maintenance. Lowercase, because every value that
-- crosses this boundary in this schema is lowercase and mixing the two is how
-- "APPROVED" vs "approved" bugs start.
ALTER TABLE harvest_schedule ADD COLUMN IF NOT EXISTS sched_type     VARCHAR(20) NOT NULL DEFAULT 'one-off';

ALTER TABLE harvest_schedule ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE harvest_schedule ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ;

-- ------------------------------------------------- status: enum -> varchar

-- Guarded on the column's CURRENT type so the migration stays re-runnable and
-- is a no-op if it has already been applied.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'harvest_schedule'
          AND column_name = 'status'
          AND udt_name = 'schedule_status'
    ) THEN
        -- The DEFAULT must go first: it is an expression of the old type and
        -- would block the ALTER ... TYPE.
        ALTER TABLE harvest_schedule ALTER COLUMN status DROP DEFAULT;
        ALTER TABLE harvest_schedule ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
        ALTER TABLE harvest_schedule ALTER COLUMN status SET DEFAULT 'planned';
    END IF;
END $$;

-- ------------------------------------------------------------- constraints

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_harvest_status') THEN
        ALTER TABLE harvest_schedule ADD CONSTRAINT chk_harvest_status
            CHECK (status IN ('draft', 'planned', 'done', 'cancelled'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_harvest_type') THEN
        ALTER TABLE harvest_schedule ADD CONSTRAINT chk_harvest_type
            CHECK (sched_type IN ('daily', 'weekly', 'one-off', 'maintenance'));
    END IF;

    -- An expected harvest is kilos, and kilos are not negative. Mirrors
    -- chk_finance_amount_nonneg: reject the impossible at the table, not in a
    -- service someone can forget to call.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_harvest_expected_nonneg') THEN
        ALTER TABLE harvest_schedule ADD CONSTRAINT chk_harvest_expected_nonneg
            CHECK (expected_kg IS NULL OR expected_kg >= 0);
    END IF;
END $$;

-- ------------------------------------------------------------------ indexes

-- The board asks "what is scheduled from today onwards", and the per-field view
-- asks "what is scheduled for this field".
CREATE INDEX IF NOT EXISTS idx_harvest_schedule_date      ON harvest_schedule (sched_date);
CREATE INDEX IF NOT EXISTS idx_harvest_schedule_zone_date ON harvest_schedule (zone_id, sched_date);
