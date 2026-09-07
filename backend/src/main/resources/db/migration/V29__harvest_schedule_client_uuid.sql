-- V29: offline idempotency for harvest schedules.
--
-- The Fields board now queues its writes in the IndexedDB outbox like the
-- attendance register and the leaf weigh-in already do, so a supervisor can
-- plan work in a dead spot and have it sync later.
--
-- Every other write on that page is naturally idempotent -- moving a field,
-- resizing it, setting a condition, marking a job done are all "last write
-- wins", and replaying one twice lands in the same place. CREATING a schedule
-- is the exception: replay it and you get two identical jobs on the board with
-- no way to tell which was meant.
--
-- Same shape as V18, which did this for attendance and leaf_collection: a
-- client-assigned UUID plus a PARTIAL unique index, so client-originated rows
-- are deduped while the many server-created rows (client_uuid NULL) are
-- unaffected.
--
-- Append-only. V28 was the last applied migration.

ALTER TABLE harvest_schedule ADD COLUMN IF NOT EXISTS client_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_harvest_schedule_client_uuid
    ON harvest_schedule(client_uuid) WHERE client_uuid IS NOT NULL;
