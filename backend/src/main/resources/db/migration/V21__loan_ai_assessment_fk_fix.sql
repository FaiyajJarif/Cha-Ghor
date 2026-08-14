-- V21: make loan_ai_assessment usable.
--
-- THE BUG
--   V1 created loan_ai_assessment with
--       loan_id BIGINT NOT NULL UNIQUE REFERENCES loans(id) ON DELETE CASCADE
--   pointing at the LEGACY plural `loans` table. The live JPA entity maps to
--   `loan` (singular); `loans` is dead and empty. So any attempt to store an
--   assessment for a real loan violated the foreign key and failed. The table
--   has never held a row, and nothing in Java has ever referenced it.
--
-- THE FIX
--   Repoint the foreign key at `loan(id)`. Safe to run: both
--   loan_ai_assessment and the legacy loans table are empty, so there is no
--   data to migrate and nothing to break.
--
-- The FK was created inline in V1 and therefore carries an auto-generated
-- name, so it is located and dropped by lookup rather than by a guessed name
-- (same approach V14 uses for the payroll and withdrawal FKs).
--
-- NOTE ON THE ENUM: risk_level is a NATIVE Postgres enum with the lowercase
-- labels ('low','med','high'). It is 'med', not 'medium'. Sending 'MEDIUM'
-- throws `invalid input value for enum risk_level`. The Java side maps it with
-- @JdbcTypeCode(SqlTypes.NAMED_ENUM), the same way payroll_status is handled.

DO $$
DECLARE
    c text;
BEGIN
    -- Only act if the table exists (it is created in V1, but stay defensive).
    IF to_regclass('public.loan_ai_assessment') IS NULL THEN
        RAISE NOTICE 'loan_ai_assessment does not exist; nothing to do';
        RETURN;
    END IF;

    -- Find whatever FK currently sits on loan_ai_assessment.loan_id.
    SELECT con.conname INTO c
      FROM pg_constraint con
      JOIN pg_attribute a
        ON a.attrelid = con.conrelid
       AND a.attnum = ANY (con.conkey)
     WHERE con.conrelid = 'loan_ai_assessment'::regclass
       AND con.contype = 'f'
       AND a.attname = 'loan_id'
     LIMIT 1;

    IF c IS NOT NULL THEN
        EXECUTE format('ALTER TABLE loan_ai_assessment DROP CONSTRAINT %I', c);
    END IF;

    -- Re-add it against the live `loan` table. CASCADE keeps the original
    -- intent: delete a loan and its assessment goes with it.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_loan_ai_assessment_loan'
    ) THEN
        ALTER TABLE loan_ai_assessment
            ADD CONSTRAINT fk_loan_ai_assessment_loan
            FOREIGN KEY (loan_id) REFERENCES loan(id) ON DELETE CASCADE;
    END IF;
END $$;

-- One current assessment per loan. V1 already declared loan_id UNIQUE, which
-- is what lets a re-score overwrite the previous one instead of piling up.
CREATE INDEX IF NOT EXISTS idx_loan_ai_assessment_loan
    ON loan_ai_assessment (loan_id);
