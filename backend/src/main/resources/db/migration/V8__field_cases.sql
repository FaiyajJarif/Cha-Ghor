-- V8: Reports & Complaints module
-- Field-issue inbox: workers and supervisors submit complaints / field reports;
-- admins triage, reply and resolve. Two fresh tables (field_case + case_reply)
-- with VARCHAR enum columns via @Enumerated(STRING) -- no native Postgres enum.
-- The KPI cards (avg response time, active count, resolution rate, compliance)
-- are computed live in the service, so only the stores + a demo seed are needed.
-- Written defensively (same approach as V4-V7): safe whether or not an earlier
-- schema already created these tables.

CREATE TABLE IF NOT EXISTS field_case (
    id                BIGSERIAL PRIMARY KEY,
    case_type         VARCHAR(20)  NOT NULL DEFAULT 'COMPLAINT',
    category          VARCHAR(60)  NOT NULL DEFAULT '',
    title             VARCHAR(200) NOT NULL DEFAULT '',
    body              TEXT         NOT NULL DEFAULT '',
    submitter_name    VARCHAR(120) NOT NULL DEFAULT '',
    submitter_role    VARCHAR(30)  NOT NULL DEFAULT '',
    submitted_by      BIGINT,
    worker_code       VARCHAR(30),
    zone              VARCHAR(40),
    priority          VARCHAR(20)  NOT NULL DEFAULT 'MEDIUM',
    status            VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    evidence_url      TEXT,
    assigned_to       BIGINT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    first_response_at TIMESTAMPTZ,
    resolved_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS case_reply (
    id          BIGSERIAL PRIMARY KEY,
    case_id     BIGINT       NOT NULL,
    author_name VARCHAR(120) NOT NULL DEFAULT '',
    author_role VARCHAR(30)  NOT NULL DEFAULT '',
    author_id   BIGINT,
    body        TEXT         NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Reconcile columns in case an older field_case / case_reply already exists.
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS case_type         VARCHAR(20)  NOT NULL DEFAULT 'COMPLAINT';
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS category          VARCHAR(60)  NOT NULL DEFAULT '';
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS title             VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS body              TEXT         NOT NULL DEFAULT '';
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS submitter_name    VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS submitter_role    VARCHAR(30)  NOT NULL DEFAULT '';
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS submitted_by      BIGINT;
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS worker_code       VARCHAR(30);
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS zone              VARCHAR(40);
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS priority          VARCHAR(20)  NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS status            VARCHAR(20)  NOT NULL DEFAULT 'OPEN';
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS evidence_url      TEXT;
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS assigned_to       BIGINT;
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ  NOT NULL DEFAULT now();
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE field_case ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMPTZ;

ALTER TABLE case_reply ADD COLUMN IF NOT EXISTS case_id     BIGINT       NOT NULL DEFAULT 0;
ALTER TABLE case_reply ADD COLUMN IF NOT EXISTS author_name VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE case_reply ADD COLUMN IF NOT EXISTS author_role VARCHAR(30)  NOT NULL DEFAULT '';
ALTER TABLE case_reply ADD COLUMN IF NOT EXISTS author_id   BIGINT;
ALTER TABLE case_reply ADD COLUMN IF NOT EXISTS body        TEXT         NOT NULL DEFAULT '';
ALTER TABLE case_reply ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ  NOT NULL DEFAULT now();

-- If an earlier schema created any of these columns as native enums, convert
-- them to VARCHAR so Hibernate @Enumerated(STRING) can store uppercase labels.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'field_case' AND column_name = 'status' AND udt_name <> 'varchar') THEN
    ALTER TABLE field_case ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
    UPDATE field_case SET status = upper(status) WHERE status ~ '^[a-z]';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'field_case' AND column_name = 'case_type' AND udt_name <> 'varchar') THEN
    ALTER TABLE field_case ALTER COLUMN case_type TYPE VARCHAR(20) USING case_type::text;
    UPDATE field_case SET case_type = upper(case_type) WHERE case_type ~ '^[a-z]';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'field_case' AND column_name = 'priority' AND udt_name <> 'varchar') THEN
    ALTER TABLE field_case ALTER COLUMN priority TYPE VARCHAR(20) USING priority::text;
    UPDATE field_case SET priority = upper(priority) WHERE priority ~ '^[a-z]';
  END IF;
END $$;

-- Relax any extra NOT NULL columns an earlier schema may have added that this
-- module never populates. No-op on a fresh DB where V8 created the table.
DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'field_case'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN (
        'id', 'case_type', 'category', 'title', 'body',
        'submitter_name', 'submitter_role', 'priority', 'status', 'created_at'
      )
  LOOP
    EXECUTE format('ALTER TABLE field_case ALTER COLUMN %I DROP NOT NULL', col);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_field_case_created_at ON field_case (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_case_status     ON field_case (status);
CREATE INDEX IF NOT EXISTS idx_field_case_type       ON field_case (case_type);
CREATE INDEX IF NOT EXISTS idx_case_reply_case       ON case_reply (case_id, created_at);

-- ---- Seed (only when empty) -----------------------------------------------
-- Two currently-active items (matches the mockup's "02" active count) plus a
-- resolved history so the resolution-rate / avg-response KPIs are meaningful.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM field_case) THEN
    INSERT INTO field_case
      (case_type, category, title, body, submitter_name, submitter_role,
       worker_code, zone, priority, status, created_at, first_response_at)
    VALUES
      ('COMPLAINT', 'Financial . Sector B1',
       'কর্মীর অভিযোগ – মজুরি প্রদানে বিলম্বের সমস্যা',
       'আমি সেক্টর বি-তে কাজ করি, কিন্তু গত শুক্রবার নির্ধারিত সাপ্তাহিক মজুরি এখনো পাইনি। এর ফলে আমার কাজে ও দৈনন্দিন জীবনে সমস্যার সৃষ্টি হয়েছে।',
       'Zawad', 'worker', 'CG418', 'A1', 'HIGH', 'OPEN',
       now() - INTERVAL '2 hours', NULL),
      ('REPORT', 'Maintenance',
       'Tractor T-04 Engine Failure',
       'Primary plucking tractor has broken down in North Estate. Requires immediate parts replacement before the next harvest cycle.',
       'Rahman Shakib', 'supervisor', NULL, 'North Estate', 'URGENT', 'IN_PROGRESS',
       now() - INTERVAL '5 hours', now() - INTERVAL '3 hours');

    INSERT INTO field_case
      (case_type, category, title, body, submitter_name, submitter_role,
       worker_code, zone, priority, status, created_at, first_response_at, resolved_at)
    VALUES
      ('COMPLAINT','Financial','Overtime hours not counted','Last week''s overtime was missing from my payslip.','Karim Uddin','worker','CG221','B2','MEDIUM','RESOLVED', now() - INTERVAL '6 days', now() - INTERVAL '6 days' + INTERVAL '2 hours', now() - INTERVAL '5 days'),
      ('REPORT','Irrigation','Blocked irrigation channel in Sector C','Water not reaching the lower rows in Sector C.','Nazma Begum','supervisor',NULL,'C1','HIGH','RESOLVED', now() - INTERVAL '9 days', now() - INTERVAL '9 days' + INTERVAL '1 hour', now() - INTERVAL '8 days'),
      ('COMPLAINT','Welfare','Drinking water shortage at rest shed','No drinking water at the east rest shed during afternoon shift.','Sultana Razia','worker','CG377','A2','MEDIUM','RESOLVED', now() - INTERVAL '12 days', now() - INTERVAL '12 days' + INTERVAL '3 hours', now() - INTERVAL '11 days'),
      ('REPORT','Maintenance','Weighing scale reading inaccurately','Sector A leaf-weighing scale is off by about 2 kg.','Rahman Shakib','supervisor',NULL,'A1','MEDIUM','RESOLVED', now() - INTERVAL '14 days', now() - INTERVAL '14 days' + INTERVAL '4 hours', now() - INTERVAL '13 days'),
      ('COMPLAINT','Financial','Advance deduction dispute','Loan deduction seems higher than agreed this month.','Josim Mia','worker','CG104','B1','MEDIUM','RESOLVED', now() - INTERVAL '17 days', now() - INTERVAL '17 days' + INTERVAL '2 hours', now() - INTERVAL '16 days'),
      ('REPORT','Safety','Slippery path near drying yard','Path near the drying yard is slippery after rain.','Abdul Halim','supervisor',NULL,'Yard','LOW','RESOLVED', now() - INTERVAL '20 days', now() - INTERVAL '20 days' + INTERVAL '5 hours', now() - INTERVAL '18 days'),
      ('COMPLAINT','Welfare','Request for additional rain gear','Team needs more raincoats for monsoon plucking.','Rekha Rani','worker','CG289','C2','LOW','RESOLVED', now() - INTERVAL '23 days', now() - INTERVAL '23 days' + INTERVAL '6 hours', now() - INTERVAL '21 days'),
      ('REPORT','Maintenance','Fertilizer sprayer nozzle clogged','Backpack sprayer nozzle repeatedly clogging in Sector B.','Nazma Begum','supervisor',NULL,'B2','MEDIUM','RESOLVED', now() - INTERVAL '26 days', now() - INTERVAL '26 days' + INTERVAL '1 hour', now() - INTERVAL '25 days'),
      ('COMPLAINT','Financial','Festival bonus not reflected','Festival bonus not yet credited to my account.','Karim Uddin','worker','CG221','B2','MEDIUM','RESOLVED', now() - INTERVAL '29 days', now() - INTERVAL '29 days' + INTERVAL '3 hours', now() - INTERVAL '27 days'),
      ('REPORT','Logistics','Delayed leaf pickup van','Collection van arrived late twice this week.','Abdul Halim','supervisor',NULL,'A1','HIGH','RESOLVED', now() - INTERVAL '33 days', now() - INTERVAL '33 days' + INTERVAL '2 hours', now() - INTERVAL '31 days'),
      ('COMPLAINT','Welfare','Childcare shed timing request','Request to adjust the childcare shed timing for the morning shift.','Sultana Razia','worker','CG377','A2','LOW','RESOLVED', now() - INTERVAL '38 days', now() - INTERVAL '38 days' + INTERVAL '4 hours', now() - INTERVAL '36 days');

    -- A seeded admin reply on the in-progress tractor report.
    INSERT INTO case_reply (case_id, author_name, author_role, body, created_at)
    SELECT id, 'Hamidum Mazid', 'admin',
           'Thanks for flagging. Parts have been ordered from the Sylhet depot and a mechanic is scheduled for tomorrow morning. Please keep the tractor idle until then.',
           now() - INTERVAL '3 hours'
    FROM field_case WHERE title = 'Tractor T-04 Engine Failure' LIMIT 1;
  END IF;
END $$;
