-- Settings module: per-user profile + notification prefs, and estate config.

-- Profile fields for the signed-in user's Settings page.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS phone        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS avatar_url   TEXT;

-- Per-user notification toggles (default on).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS notify_broadcast  BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_attendance BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_payroll    BOOLEAN NOT NULL DEFAULT TRUE;

-- Single-row estate / workspace settings (id = 1).
CREATE TABLE IF NOT EXISTS app_setting (
    id          BIGINT PRIMARY KEY,
    estate_name VARCHAR(160) NOT NULL DEFAULT 'Cha-Ghor Estate',
    logo_url    TEXT,
    currency    VARCHAR(8)   NOT NULL DEFAULT '৳',
    updated_by  BIGINT,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT app_setting_singleton CHECK (id = 1)
);

INSERT INTO app_setting (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
