-- V37: a 4-digit PIN so a tea plucker can sign in without typing a password.
--
-- ============================================================================
-- WHY A PIN AT ALL
-- ============================================================================
--
-- The password rule this system now enforces -- eight characters, a capital, a
-- digit, a symbol -- is correct for an office login and close to hostile on a
-- cheap Android keyboard in a field, for someone who may read slowly. The
-- realistic outcome of that rule alone is workers writing passwords on paper,
-- or handing their phone to a supervisor to type it. Both are worse than a PIN.
--
-- ============================================================================
-- A PIN IS ONLY 10,000 COMBINATIONS. THAT IS THE WHOLE DESIGN PROBLEM.
-- ============================================================================
--
-- If a PIN alone could log somebody in, an attacker guessing at random would
-- land on SOMEBODY'S account roughly once every 10,000/N tries, where N is the
-- number of workers. On a 200-worker estate that is one hit per 50 guesses.
--
-- So the PIN never identifies anybody by itself. Login is PHONE NUMBER + PIN:
-- the phone says who you are, the PIN proves it. That turns a 1-in-50 problem
-- back into 1-in-10,000 against a chosen target, and the rate limiter caps the
-- attempts long before that.
--
-- Uniqueness is still enforced below, for a different reason: so the office can
-- never issue the same PIN twice and have two workers who both believe "my
-- number is 4417".
--
-- ============================================================================
-- THE PIN IS HASHED, NOT STORED
-- ============================================================================
--
-- pin_hash is BCrypt, exactly like password_hash. Nobody -- not an admin, not
-- whoever can read this database -- can look up a worker's PIN. It is shown to
-- the admin ONCE at approval, to pass on, and then it exists nowhere in
-- readable form.
--
-- BCrypt is salted, so two identical PINs produce different hashes and the hash
-- column cannot enforce uniqueness. pin_lookup is a plain unsalted SHA-256 of
-- the PIN, kept ONLY so a UNIQUE index can reject a collision at issue time.
-- It is not a secret worth protecting on its own: 10,000 SHA-256 values is a
-- table anyone can build in a second. It is a uniqueness key, never an
-- authentication check -- authentication always goes through pin_hash.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pin_hash    VARCHAR(100),
    ADD COLUMN IF NOT EXISTS pin_lookup  CHAR(64),
    ADD COLUMN IF NOT EXISTS pin_set_at  TIMESTAMPTZ;

-- NO TWO WORKERS SHARE A PIN. Partial, so the overwhelming majority of rows
-- (everyone without a PIN) are not forced into a single NULL collision.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_pin_lookup
    ON users (pin_lookup)
    WHERE pin_lookup IS NOT NULL;

-- PIN login resolves a worker by phone, so that lookup needs to be indexed and
-- unambiguous. NOT a unique constraint: two family members sharing one handset
-- is ordinary here, and refusing the second account would be the system telling
-- a real worker they do not exist. The service handles the ambiguity instead --
-- see AuthController.loginWithPin.
CREATE INDEX IF NOT EXISTS idx_users_phone
    ON users (phone)
    WHERE phone IS NOT NULL;

COMMENT ON COLUMN users.pin_lookup IS
    'Unsalted SHA-256 of the PIN. Exists ONLY so the unique index can prevent '
    'two workers being issued the same PIN. Never used to authenticate.';
