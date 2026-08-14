-- Run ONCE as a Postgres superuser / the DB owner AFTER migration V12 has been
-- applied (V12 creates the views this role is allowed to read).
--
--   psql -h localhost -p 5433 -U chaghor -d chaghor -f ai_readonly_setup.sql
--
-- Creates the least-privilege login role the AI service uses. It can SELECT
-- ONLY the two curated views -- nothing else in the schema.

DO $$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chabot_readonly') THEN
      CREATE ROLE chabot_readonly LOGIN PASSWORD 'chabot_readonly_pw';
   END IF;
END
$$;

-- Start from zero privileges.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM chabot_readonly;
REVOKE ALL ON SCHEMA public FROM chabot_readonly;

-- Allow connecting + using the schema, then SELECT on the two views only.
GRANT CONNECT ON DATABASE chaghor TO chabot_readonly;
GRANT USAGE ON SCHEMA public TO chabot_readonly;
GRANT SELECT ON view_worker, view_attendance TO chabot_readonly;

-- Belt and braces: the role can never write, even if a grant slips in later.
ALTER ROLE chabot_readonly SET default_transaction_read_only = on;
