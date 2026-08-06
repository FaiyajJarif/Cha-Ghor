-- V11: editable estate warehouse
-- Moves the warehouse marker out of application.yml into a single-row table so an
-- admin can relocate it from the app (PUT /api/v1/supply/warehouse) and have the
-- live map + every /track page pick up the new position immediately.
-- Seeded with the same Srimangal defaults used by app.warehouse.*.

CREATE TABLE warehouse (
    id         BIGINT        PRIMARY KEY,
    name       VARCHAR(120)  NOT NULL,
    lat        NUMERIC(9, 6) NOT NULL,
    lng        NUMERIC(9, 6) NOT NULL,
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

INSERT INTO warehouse (id, name, lat, lng)
VALUES (1, 'Chaghor Central Warehouse - Srimangal', 24.3065, 91.7296);
