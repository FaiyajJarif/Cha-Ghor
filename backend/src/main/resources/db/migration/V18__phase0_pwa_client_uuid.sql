-- ============================================================
-- V18 — Phase 0: offline-first idempotency keys (PWA)
-- The service worker assigns a client_uuid to each queued write in the
-- IndexedDB outbox. On sync the server upserts by client_uuid, so a
-- double-send (flaky rural network) can never create duplicate rows.
-- ============================================================

ALTER TABLE attendance      ADD COLUMN IF NOT EXISTS client_uuid UUID;
ALTER TABLE leaf_collection ADD COLUMN IF NOT EXISTS client_uuid UUID;

-- Partial UNIQUE: enforces idempotency for client-originated rows while still
-- allowing many server-created rows (client_uuid NULL).
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_client_uuid
    ON attendance(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_leaf_client_uuid
    ON leaf_collection(client_uuid) WHERE client_uuid IS NOT NULL;

-- NOTE: V16 (AI least-privilege GRANTs) and V17 (leaf/withdrawal tables) are
-- intentionally not in this pack:
--   V16 -> ships with the AI-service layer (needs ai_readonly_setup.sql).
--   V17 -> dropped: leaf_collection + withdrawal_request already exist in V1.
