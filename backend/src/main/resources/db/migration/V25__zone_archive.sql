-- ============================================================
-- V25 — fields can be retired, never destroyed
--
-- Until now a field could not be added, renamed or removed at all: the four
-- zones came from DataInitializer and nothing could change them.
--
-- Removal is an ARCHIVE, not a DELETE, and that is a deliberate refusal to
-- offer the destructive version. A hard DELETE on zones would:
--   * NULL attendance.zone_id      -> every past record of who worked that
--                                     field loses its field attribution
--   * NULL leaf_collection.zone_id -> last season's yield per field becomes
--                                     unattributable, permanently
--   * CASCADE supervisor_zone      -> assignments vanish
--   * CASCADE harvest_schedule     -> schedules vanish
--
-- Setting archived_at instead keeps every historical row intact and pointing at
-- a real field. The field simply stops appearing in pickers, maps and today's
-- boards. It is reversible; a delete is not.
-- ============================================================

ALTER TABLE zones
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Active fields are read on nearly every screen; archived ones almost never.
-- A partial index keeps the common query cheap without indexing the tail.
CREATE INDEX IF NOT EXISTS idx_zones_active
    ON zones(id) WHERE archived_at IS NULL;

-- Codes identify a field on the ground, so two live fields must not share one.
-- Scoped to live rows only: retiring "B-2" and later creating a new "B-2" is a
-- legitimate thing for an estate to do.
CREATE UNIQUE INDEX IF NOT EXISTS ux_zones_code_active
    ON zones(lower(code)) WHERE archived_at IS NULL AND code IS NOT NULL;
