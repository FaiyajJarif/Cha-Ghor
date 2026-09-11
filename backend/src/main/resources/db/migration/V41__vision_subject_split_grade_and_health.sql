-- V41: tell the leaf GRADER apart from the leaf HEALTH detector.
--
-- ============================================================================
-- THE BUG
-- ============================================================================
--
-- Two different models write into vision_inference:
--
--   LeafGradingService  -- suggests a pluck grade (A/B/C)
--   LeafHealthService   -- scores leaf health / disease
--
-- Both wrote subject_type = 'leaf_grade'. LeafHealthService.save() set it
-- literally, because 'leaf_health' did not exist in the enum -- V1 created
-- vision_subject AS ENUM ('leaf_grade','pest') and 'pest' was never used by
-- anything.
--
-- VisionReviewService.accuracy() then counted EVERY reviewed row with no
-- filter and returned one accuracyPct. So the number mixed:
--
--   * the grader, measured at 56.7% against a 51% always-guess-A baseline,
--     p = 0.15 -- indistinguishable from guessing (LEAF_GRADING_ACCURACY.md,
--     n = 97 labelled Sylhet photographs), and
--   * the health detector, which has never been measured at all.
--
-- One percentage describing two models, one of which is known to be at chance.
-- It described neither. Grade-A kilos carry a ৳1/kg bonus, so the grader's real
-- accuracy is not a cosmetic number.
--
-- ============================================================================
-- WHY THE ENUM IS RETIRED RATHER THAN EXTENDED
-- ============================================================================
--
-- CLAUDE.md §6: new schema uses VARCHAR + CHECK, not native Postgres enums.
-- V23 wrote down why; V28 retired schedule_status for the same reason and this
-- follows V28's shape exactly.
--
-- There is also a hard technical reason here. `ALTER TYPE ... ADD VALUE` cannot
-- be followed by a statement that USES the new value inside the same
-- transaction -- Postgres raises "unsafe use of new value of enum type". Flyway
-- runs each migration in one transaction, so adding 'leaf_health' and
-- backfilling with it in a single script is not possible. Converting the column
-- to VARCHAR sidesteps that entirely and moves the schema the way the project
-- has already decided to go.

-- ---------------------------------------------------------------------------
-- 1. enum -> VARCHAR, guarded so a re-run is a no-op
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name  = 'vision_inference'
          AND column_name = 'subject_type'
          AND udt_name    = 'vision_subject'
    ) THEN
        ALTER TABLE vision_inference ALTER COLUMN subject_type DROP DEFAULT;
        ALTER TABLE vision_inference
            ALTER COLUMN subject_type TYPE VARCHAR(20) USING subject_type::text;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Backfill the rows the health detector wrote
-- ---------------------------------------------------------------------------
--
-- The discriminator is columns only the health path ever populates. Verified
-- against both services: LeafGradingService's two builders set label,
-- confidence and model and NOTHING else, while LeafHealthService.save() sets
-- health_score, health_band and candidates_json.
--
-- HONEST LIMIT: a health reading where the model refused outright can leave all
-- three null, and such a row is indistinguishable from a grader row after the
-- fact. Those stay labelled 'leaf_grade'. They are refusals, and accuracy()
-- excludes refusals from the percentage anyway, so they cannot skew the figure
-- -- but the `reviewed` count for grade may be slightly overstated on data
-- recorded before this migration. Anything recorded after it is exact.
UPDATE vision_inference
   SET subject_type = 'leaf_health'
 WHERE subject_type = 'leaf_grade'
   AND (health_score    IS NOT NULL
     OR health_band     IS NOT NULL
     OR candidates_json IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 3. VARCHAR + CHECK, the V23/V28 convention
-- ---------------------------------------------------------------------------
-- 'pest' is kept even though nothing writes it: it is a live value in the old
-- enum, and dropping a value a historical row might hold would make this
-- migration destructive. It costs nothing to allow.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vision_subject') THEN
        ALTER TABLE vision_inference ADD CONSTRAINT chk_vision_subject
            CHECK (subject_type IN ('leaf_grade', 'leaf_health', 'pest'));
    END IF;
END $$;

ALTER TABLE vision_inference ALTER COLUMN subject_type SET NOT NULL;

-- NO NEW INDEX. V26 already created
--   idx_vision_reviewed ON vision_inference(subject_type, reviewed_at)
--                       WHERE reviewed_at IS NOT NULL
-- which is exactly what accuracy()'s per-subject query needs. Adding a second
-- one differing only by DESC would cost writes and buy nothing. Postgres
-- rebuilds an index automatically when the column type changes, so the existing
-- one survives this migration.

COMMENT ON COLUMN vision_inference.subject_type IS
    'Which model produced this row: leaf_grade (pluck grade) or leaf_health '
    '(disease/health score). Kept apart so accuracy can be reported per model '
    'rather than as one pooled figure describing neither.';
