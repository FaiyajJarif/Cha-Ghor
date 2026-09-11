-- =========================================================================
-- set_worker_phones.sql  --  put REAL mobile numbers on the demo workers
-- =========================================================================
--
-- WHY THIS IS A SCRIPT AND NOT A CODE CHANGE
--
--   The five demo workers are created by DataInitializer.seedWorkforce(),
--   which returns early the moment `workers` has any row in it. On a database
--   that has already been seeded it never runs again, so editing that array
--   changes NOTHING on an existing install. The numbers have to be updated in
--   the table, which is what this does.
--
--   DataInitializer is also deliberately left holding the +88017100000xx
--   placeholders. It is committed source in a university repo that gets zipped
--   and handed around; real personal mobile numbers do not belong in it. Keep
--   them here, in a file you can choose not to commit.
--
-- SAFETY
--   * Idempotent. Running it twice sets the same values twice.
--   * Matches on full_name, not id, because ids differ between installs.
--   * Refuses to run at all if the expected names are not there, rather than
--     updating zero rows and reporting success -- the exact failure mode that
--     makes people think the numbers changed when they did not.
--   * Touches only `workers.phone`. Nothing else.
--
-- RUN IT (from the chaghor/ directory)
--
--   docker exec -i chaghor-postgres psql -U chaghor -d chaghor < sql/set_worker_phones.sql
--
--   The container is named `chaghor-postgres` (container_name in
--   docker/docker-compose.yml), NOT `chaghor-db` -- that is the service key,
--   and using it gets you "No such container".
--
--   Going in over the network instead needs a password:
--     PGPASSWORD=chaghor_dev_pw psql -h 127.0.0.1 -p 5433 -U chaghor \
--       -d chaghor -f sql/set_worker_phones.sql
--   127.0.0.1, not localhost: the port is bound to loopback deliberately.
--
-- =========================================================================

BEGIN;

-- 0. Fail loudly if the workers are not the ones we expect. --------------
DO $$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(n, ', ')
      INTO missing
      FROM unnest(ARRAY[
             'Abdul Karim', 'Rahima Begum', 'Jamal Uddin', 'Fatema Khatun'
           ]) AS n
     WHERE NOT EXISTS (
             SELECT 1 FROM workers w
              WHERE lower(btrim(w.full_name)) = lower(btrim(n))
           );

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION
          'set_worker_phones: worker(s) not found: %. Check `SELECT id, full_name FROM workers;` and edit the names below to match.',
          missing;
    END IF;
END $$;

-- 1. The mapping. -------------------------------------------------------
--
-- Stored in E.164 (+880...), which is what V1 documents for this column and
-- what Messages.app on macOS needs to route an SMS. The leading 0 of the
-- local form is DROPPED: 01560048649 -> +8801560048649. Storing the local
-- form instead is the quiet way to get "not delivered" with no error.
--
-- Abdul Karim is first deliberately: DataInitializer.linkWorkerAccount()
-- links the `worker` login to the first worker with no account, which is him.
-- He is the one who taps বেতন তুলুন in a demo, so he gets the first number.

UPDATE workers SET phone = '+8801560048649' WHERE lower(btrim(full_name)) = 'abdul karim';
UPDATE workers SET phone = '+8801983414963' WHERE lower(btrim(full_name)) = 'rahima begum';
UPDATE workers SET phone = '+8801754889771' WHERE lower(btrim(full_name)) = 'jamal uddin';
UPDATE workers SET phone = '+8801332442132' WHERE lower(btrim(full_name)) = 'fatema khatun';

-- Nurul Islam is left on +8801710000005 on purpose. He is the control: a
-- worker whose SMS row should come back `failed`, which is how you tell the
-- send path is genuinely reporting delivery rather than always saying "sent".

-- 2. Show the result so you can eyeball it before committing. -----------
\echo ''
\echo '--- workers.phone after update ---'
SELECT id, full_name, phone,
       CASE WHEN phone LIKE '+88017100000%' THEN 'placeholder' ELSE 'REAL' END AS kind
  FROM workers
 WHERE deleted_at IS NULL
 ORDER BY id;
\echo ''

COMMIT;
