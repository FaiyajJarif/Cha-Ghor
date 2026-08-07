-- ============================================================
-- V26 — leaf health assessment, and the review trail that makes it trainable
--
-- Additive only. Every column is nullable, so existing vision_inference rows
-- stay valid and nothing that reads the table today changes behaviour.
--
-- WHY THIS IS SEPARATE FROM THE PLUCK GRADE
-- -----------------------------------------
-- health_score measures the CONDITION OF THE LEAF (disease, nitrogen
-- deficiency, sun scorch, water stress). `label` measures HOW IT WAS PLUCKED,
-- and that is the one payroll pays a bonus on.
--
-- They must never be merged. A plucker can hand in a textbook two-leaves-and-
-- a-bud pluck off a bush with a nitrogen problem: the pluck is Grade A, the
-- health score is 45. Deriving pay from health would dock that worker's wage
-- for the bush's condition, which they do not control and cannot fix.
--
-- THE REVIEW COLUMNS EXIST FROM DAY ONE ON PURPOSE
-- ------------------------------------------------
-- reviewed_by / supervisor_verdict / corrected_condition turn every human
-- correction into a labelled training example. Without them the system
-- accumulates thousands of unverified model outputs, which is worthless for
-- training a CNN later; with them, ordinary daily use builds the dataset.
-- ============================================================

ALTER TABLE vision_inference
    -- 0-100, severity x coverage. NULL means health was never assessed for
    -- this row, which is different from a score of 0.
    ADD COLUMN IF NOT EXISTS health_score      SMALLINT,
    -- HEALTHY | MINOR | MODERATE | SEVERE, derived from health_score.
    ADD COLUMN IF NOT EXISTS health_band       VARCHAR(16),
    -- The ranked candidate conditions with their likelihoods, as returned.
    -- JSONB so the shape can change without a migration.
    ADD COLUMN IF NOT EXISTS candidates_json   JSONB,
    -- Why a photo was refused: blurred | too_dark | no_leaf | too_far.
    -- A refusal is a CORRECT outcome, recorded so it can be counted separately
    -- from predictions rather than scored as a wrong answer.
    ADD COLUMN IF NOT EXISTS refused_reason    VARCHAR(40),

    -- ---- human review: the labelled data ----
    ADD COLUMN IF NOT EXISTS reviewed_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at       TIMESTAMPTZ,
    -- agree | disagree | unsure
    ADD COLUMN IF NOT EXISTS supervisor_verdict VARCHAR(16),
    -- What the condition ACTUALLY was, when the supervisor disagreed. This
    -- column is the training label.
    ADD COLUMN IF NOT EXISTS corrected_condition VARCHAR(60),
    -- The pluck grade the supervisor finally recorded, so model-vs-human can be
    -- compared on grading too.
    ADD COLUMN IF NOT EXISTS corrected_grade   leaf_grade;

-- A score outside 0-100 is a bug, not a reading. NOT VALID so the constraint
-- applies to new and updated rows without rewriting the table.
ALTER TABLE vision_inference
    ADD CONSTRAINT chk_vision_health_score
    CHECK (health_score IS NULL OR (health_score >= 0 AND health_score <= 100))
    NOT VALID;

-- Exporting the training set means "every row a human has ruled on".
CREATE INDEX IF NOT EXISTS idx_vision_reviewed
    ON vision_inference(subject_type, reviewed_at)
    WHERE reviewed_at IS NOT NULL;

-- NOTE: no migration is needed for pluck grade C. leaf_grade has been
-- ENUM('A','B','C') since V1 and the Java LeafGrade enum already has C --
-- only the UI omitted it.
