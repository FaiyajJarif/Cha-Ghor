-- V38: users.pin_lookup CHAR(64) -> VARCHAR(64).
--
-- ============================================================================
-- WHAT BROKE
-- ============================================================================
--
-- V37 declared the column as CHAR(64). The entity declares it as
-- @Column(length = 64) on a String, which Hibernate maps to VARCHAR. Postgres
-- reports CHAR as `bpchar`, a DIFFERENT JDBC type code from VARCHAR, so schema
-- validation refused to build the EntityManagerFactory and the application
-- would not start at all:
--
--   Schema-validation: wrong column type encountered in column [pin_lookup]
--   found [bpchar (Types#CHAR)], but expecting [varchar(64) (Types#VARCHAR)]
--
-- Hibernate validates the schema at startup, so this is not a warning that
-- surfaces later under load -- it is a hard stop before the first request.
--
-- ============================================================================
-- WHY A NEW MIGRATION INSTEAD OF EDITING V37
-- ============================================================================
--
-- V37 has already run. Migrations are append-only: Flyway records a checksum
-- for every applied script and editing one turns every subsequent startup into
-- a validation failure on a DIFFERENT thing. The type is corrected forward.
--
-- ============================================================================
-- CHAR WAS THE WRONG TYPE ANYWAY
-- ============================================================================
--
-- CHAR(n) is blank-padded: Postgres pads every value out to n characters and
-- the padding is invisible in most clients. A SHA-256 hex digest is exactly 64
-- characters so nothing is padded in practice, but a column whose stored value
-- silently differs from what was written has no business holding a uniqueness
-- key. VARCHAR stores what it is given.
--
-- Safe on existing rows: no PIN has been issued yet if the application has
-- never started, and even where one has, USING is unnecessary because every
-- stored value is already exactly 64 characters with no padding to strip.

ALTER TABLE users
    ALTER COLUMN pin_lookup TYPE VARCHAR(64);

-- The unique index from V37 rides along with the type change; recreated here
-- only if it somehow did not survive, so this script is safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_pin_lookup
    ON users (pin_lookup)
    WHERE pin_lookup IS NOT NULL;

COMMENT ON COLUMN users.pin_lookup IS
    'Unsalted SHA-256 of the PIN. Exists ONLY so the unique index can prevent '
    'two workers being issued the same PIN. Never used to authenticate.';
