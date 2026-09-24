-- ===========================================================================
-- Add two test workers, each with a login, to an existing Cha Ghor database.
-- ===========================================================================
--
-- Run it:
--
--   psql -h localhost -p 5433 -U chaghor -d chaghor -f sql/add_two_test_workers.sql
--
-- (password chaghor_dev_pw)
--
-- WHAT YOU GET
--
--   Shahida Akter   CG-new   username shahida   password Shahida@2026   PIN 7381
--   Monir Hossain   CG-new   username monir     password Monir@2026     PIN 5294
--
--   Shahida carries an ACTIVE ৳1,000 loan at ৳20/day. Monir carries nothing.
--   That pairing is the point: settle a day and Shahida's slip shows a ৳20
--   deduction while Monir's shows none, so you can see that the deduction
--   comes from a real loan row and not from the wage formula.
--
-- IT ONLY ADDS. It never updates or deletes an existing row, and it is safe to
-- run twice -- the second run inserts nothing and prints the same summary.
--
-- ---------------------------------------------------------------------------
-- WHY THE PASSWORD HASHES ARE PASTED IN AND NOT COMPUTED HERE
-- ---------------------------------------------------------------------------
-- Postgres cannot produce a BCrypt hash without the pgcrypto extension, and
-- SecurityConfig uses a plain `new BCryptPasswordEncoder()` -- strength 10,
-- `$2a$` prefix. The hashes below were generated at that strength and verified
-- to round-trip. Do not retype them: one wrong character gives you an account
-- that exists, looks fine in the table, and rejects the password.
--
-- The PIN columns follow V37: `pin_hash` is BCrypt (that is what actually
-- authenticates), `pin_lookup` is a plain SHA-256 of the four digits and exists
-- only so the unique index can stop two workers being issued the same PIN.
--
-- PIN sign-in is PHONE + PIN, not PIN alone, so the phone numbers below have to
-- stay distinct from every other user's.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run if either PIN is already in use by somebody else.
-- ---------------------------------------------------------------------------
-- The unique index would reject the INSERT anyway, but it would do it with
-- "duplicate key value violates unique constraint uq_users_pin_lookup", which
-- says nothing about whose PIN it is or what to do. Fail with a sentence
-- instead. Our own two accounts are excluded so a second run is not an error.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM users
        WHERE pin_lookup IN (
                'f52c1308a6e3dcaeb86e48331f2e5bc3fa26b02bf776513f0ec2e917e56d2077',
                'e71d3cc1a48486830d844e51cab5b079ea2a85598cfb11dabd055bf481961b34')
          AND username NOT IN ('shahida', 'monir')
    ) THEN
        RAISE EXCEPTION
            'PIN 7381 or 5294 is already issued to another worker. Pick different '
            'PINs, or clear the existing one, before running this script.';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The two logins.
-- ---------------------------------------------------------------------------
-- role is the native enum user_role, which is LOWERCASE ('worker'), so the cast
-- matters. approval_status 'approved' and is_active true are both required --
-- login checks BOTH (V36 explains why they are separate columns).
--
-- locale 'bn' because the worker console is entirely Bangla.
INSERT INTO users (
    username, email, password_hash, role, locale, is_active,
    display_name, phone, approval_status,
    pin_hash, pin_lookup, pin_set_at
)
VALUES
    ('shahida', 'shahida@chaghor.local',
     '$2a$10$u7W6Vq2hVO.QcdKRkjj2IuEuRD2CbGFuggjW6eh4l6RwfwVEVF786',
     'worker'::user_role, 'bn'::locale_code, TRUE,
     'Shahida Akter', '+8801712345601', 'approved',
     '$2a$10$XJTBSUa0VjTJXvrIS1XlXOkPGlgLPuuooaPXcbXihP56udbVirQPu',
     'f52c1308a6e3dcaeb86e48331f2e5bc3fa26b02bf776513f0ec2e917e56d2077',
     now()),

    ('monir', 'monir@chaghor.local',
     '$2a$10$AwZPBvwuG0uld9yOOkJUK.VRm2dwfGq00sDCV5GKqEDWD1eUhhTcm',
     'worker'::user_role, 'bn'::locale_code, TRUE,
     'Monir Hossain', '+8801712345602', 'approved',
     '$2a$10$LqqQ/GpPWq1Aja1GkBQMaOvVHG73xKSmwkqHlQDuHh4fWMPUYbNWq',
     'e71d3cc1a48486830d844e51cab5b079ea2a85598cfb11dabd055bf481961b34',
     now())
ON CONFLICT (username) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The two worker records, each linked to its login.
-- ---------------------------------------------------------------------------
-- workers.user_id IS THE LINK THE WHOLE WORKER CONSOLE DEPENDS ON. Without it
-- the account signs in successfully and then every screen says "This account is
-- not linked to a worker record yet" -- which reads as a broken app rather than
-- a missing row. DataInitializer had the same bug and had to be patched.
--
-- supervisor_id is a users.id, not a workers.id. Nothing in Java reads
-- supervisor_zone, and the attendance register lists every live worker
-- regardless of zone, so these two will appear for whoever signs in as
-- supervisor.
--
-- The NOT EXISTS makes a second run a no-op rather than a duplicate person.
INSERT INTO workers (
    user_id, full_name, name_bn, phone, national_id, dob, gender,
    zone_id, supervisor_id, join_date, daily_wage, status, job_role
)
SELECT u.id,
       'Shahida Akter', 'শাহিদা আক্তার', '+8801712345601', '1990123456701',
       DATE '1990-04-11', 'female',
       (SELECT id FROM zones WHERE code = 'A1' LIMIT 1),
       (SELECT id FROM users WHERE username = 'supervisor' LIMIT 1),
       CURRENT_DATE - 400, 170.00, 'active', 'plucker'
FROM users u
WHERE u.username = 'shahida'
  AND NOT EXISTS (
      SELECT 1 FROM workers w WHERE w.user_id = u.id AND w.deleted_at IS NULL);

INSERT INTO workers (
    user_id, full_name, name_bn, phone, national_id, dob, gender,
    zone_id, supervisor_id, join_date, daily_wage, status, job_role
)
SELECT u.id,
       'Monir Hossain', 'মনির হোসেন', '+8801712345602', '1987123456702',
       DATE '1987-09-02', 'male',
       (SELECT id FROM zones WHERE code = 'B1' LIMIT 1),
       (SELECT id FROM users WHERE username = 'supervisor' LIMIT 1),
       CURRENT_DATE - 250, 170.00, 'active', 'plucker'
FROM users u
WHERE u.username = 'monir'
  AND NOT EXISTS (
      SELECT 1 FROM workers w WHERE w.user_id = u.id AND w.deleted_at IS NULL);

-- ---------------------------------------------------------------------------
-- 3. An ACTIVE loan for Shahida only.
-- ---------------------------------------------------------------------------
-- PENDING DEDUCTS NOTHING. A loan only moves at settlement once it is ACTIVE,
-- so a request left pending produces the "all deductions are ৳0" symptom that
-- MANUAL_TEST.md lists first in its troubleshooting table.
--
-- worker_name is denormalised into the loan table on purpose (V14 kept the
-- shipped shape and added worker_id beside it), so BOTH are set. Setting only
-- one gives you a loan that shows in the list but never deducts, or deducts for
-- a name nobody recognises.
--
-- repaid starts at 0. Settlement is what moves it.
INSERT INTO loan (
    worker_id, reference, worker_name, zone, principal, reason,
    repaid, daily_deduction, status, requested_at, decided_at
)
SELECT w.id, 'LN-TEST-01', w.full_name,
       (SELECT code FROM zones z WHERE z.id = w.zone_id),
       1000.00, 'Test loan - school fees',
       0.00, 20.00, 'ACTIVE', now(), now()
FROM workers w
WHERE w.full_name = 'Shahida Akter'
  AND w.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM loan l WHERE l.reference = 'LN-TEST-01');

COMMIT;

-- ===========================================================================
-- 4. Verification. Read this output -- do not assume the script worked.
-- ===========================================================================
\echo ''
\echo '--- logins (expect 2 rows, both approved + active, both with a PIN) ---'
SELECT u.id, u.username, u.role, u.phone, u.approval_status, u.is_active,
       (u.pin_hash IS NOT NULL) AS has_pin
FROM users u
WHERE u.username IN ('shahida', 'monir')
ORDER BY u.username;

\echo ''
\echo '--- worker records (user_id MUST NOT be null, or the console breaks) ---'
SELECT w.id, w.full_name, w.user_id, w.zone_id, w.status, w.daily_wage
FROM workers w
WHERE w.full_name IN ('Shahida Akter', 'Monir Hossain')
  AND w.deleted_at IS NULL
ORDER BY w.full_name;

\echo ''
\echo '--- loans (expect exactly ONE row: Shahida, ACTIVE, 1000 @ 20/day) ---'
SELECT l.id, l.reference, l.worker_id, l.worker_name, l.principal,
       l.repaid, l.daily_deduction, l.status
FROM loan l
WHERE l.reference = 'LN-TEST-01';
