-- V10: live shipment tracking
-- Adds a public per-shipment tracking token (doubles as authorization for the
-- no-login driver page) plus the latest reported GPS position. gen_random_uuid()
-- is built into Postgres 13+, so no extension is required.

ALTER TABLE shipment
    ADD COLUMN track_token  VARCHAR(40),
    ADD COLUMN current_lat  NUMERIC(9, 6),
    ADD COLUMN current_lng  NUMERIC(9, 6),
    ADD COLUMN heading_deg  NUMERIC(5, 1),
    ADD COLUMN last_ping_at TIMESTAMPTZ;

-- Backfill tokens for the demo rows seeded in V9 so their driver links work.
UPDATE shipment
SET track_token = replace(gen_random_uuid()::text, '-', '')
WHERE track_token IS NULL;

ALTER TABLE shipment
    ALTER COLUMN track_token SET NOT NULL;

CREATE UNIQUE INDEX ux_shipment_track_token ON shipment (track_token);
