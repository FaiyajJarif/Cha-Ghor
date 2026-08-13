-- ============================================================
-- Cha Ghor Tea Garden Management System
-- Flyway migration V1 : initial schema (29 tables)
-- Target: PostgreSQL 16 + pgvector
-- Place at: backend/src/main/resources/db/migration/V1__init.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- ENUM types (mirror the state machines) ----------
CREATE TYPE user_role          AS ENUM ('admin','supervisor','worker');
CREATE TYPE locale_code        AS ENUM ('en','bn');
CREATE TYPE attendance_status  AS ENUM ('present','absent','leave');
CREATE TYPE leaf_grade         AS ENUM ('A','B','C');
CREATE TYPE schedule_status    AS ENUM ('planned','done');
CREATE TYPE payroll_status     AS ENUM ('draft','review','approved','paid');
CREATE TYPE withdrawal_method  AS ENUM ('bkash');
CREATE TYPE withdrawal_status  AS ENUM ('pending','paid','rejected');
CREATE TYPE txn_type           AS ENUM ('revenue','expense');
CREATE TYPE loan_status        AS ENUM ('applied','ai_checked','approved','rejected','disbursed','repaying','closed');
CREATE TYPE risk_level         AS ENUM ('low','med','high');
CREATE TYPE requisition_status AS ENUM ('pending','approved','rejected');
CREATE TYPE chemical_type      AS ENUM ('fertilizer','pesticide');
CREATE TYPE broadcast_audience AS ENUM ('all','zone','role');
CREATE TYPE broadcast_channel  AS ENUM ('in_app','sms');
CREATE TYPE sms_category       AS ENUM ('payroll','loan','withdrawal','alert');
CREATE TYPE sms_status         AS ENUM ('sent','failed','mock');
CREATE TYPE complaint_priority AS ENUM ('low','med','high');
CREATE TYPE complaint_status   AS ENUM ('open','in_progress','resolved');
CREATE TYPE compliance_status  AS ENUM ('pending','met','overdue');
CREATE TYPE vision_subject     AS ENUM ('leaf_grade','pest');
CREATE TYPE prediction_type    AS ENUM ('yield','anomaly','reorder');
CREATE TYPE shipment_stage     AS ENUM ('sourcing','processing','storage','dispatch');

-- ================= IDENTITY & ORG =================
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(60)  NOT NULL UNIQUE,
    email         VARCHAR(160) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          user_role    NOT NULL,
    locale        locale_code  NOT NULL DEFAULT 'en',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE zones (
    id                BIGSERIAL PRIMARY KEY,
    name              VARCHAR(120) NOT NULL,
    code              VARCHAR(40)  NOT NULL UNIQUE,
    area_hectare      NUMERIC(10,2),
    polygon_geojson   JSONB,
    target_kg_per_day NUMERIC(10,2)
);

CREATE TABLE workers (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    full_name     VARCHAR(160) NOT NULL,
    name_bn       VARCHAR(160),
    phone         VARCHAR(20),          -- E.164, e.g. +8801XXXXXXXXX
    national_id   VARCHAR(40),
    dob           DATE,
    zone_id       BIGINT REFERENCES zones(id) ON DELETE SET NULL,
    supervisor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    join_date     DATE,
    daily_wage    NUMERIC(12,2) NOT NULL DEFAULT 170.00,
    status        VARCHAR(20)   NOT NULL DEFAULT 'active',
    photo_url     VARCHAR(300),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE supervisor_zone (
    id            BIGSERIAL PRIMARY KEY,
    supervisor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zone_id       BIGINT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (supervisor_id, zone_id)
);

-- ================= AI VISION (needed before leaf_collection) =================
CREATE TABLE vision_inference (
    id           BIGSERIAL PRIMARY KEY,
    subject_type vision_subject NOT NULL,
    subject_ref  VARCHAR(80),
    image_url    VARCHAR(300),
    label        VARCHAR(80),
    confidence   NUMERIC(5,4),
    model        VARCHAR(80),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= CORE OPERATIONS =================
CREATE TABLE attendance (
    id         BIGSERIAL PRIMARY KEY,
    worker_id  BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    work_date  DATE   NOT NULL,
    status     attendance_status NOT NULL,
    zone_id    BIGINT REFERENCES zones(id) ON DELETE SET NULL,
    marked_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (worker_id, work_date)
);

CREATE TABLE leaf_collection (
    id            BIGSERIAL PRIMARY KEY,
    worker_id     BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    zone_id       BIGINT REFERENCES zones(id) ON DELETE SET NULL,
    collect_date  DATE   NOT NULL,
    weight_kg     NUMERIC(10,2) NOT NULL DEFAULT 0,
    quality_grade leaf_grade,
    photo_id      BIGINT REFERENCES vision_inference(id) ON DELETE SET NULL,
    recorded_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE harvest_schedule (
    id            BIGSERIAL PRIMARY KEY,
    zone_id       BIGINT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    sched_date    DATE   NOT NULL,
    task          VARCHAR(160),
    supervisor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status        schedule_status NOT NULL DEFAULT 'planned'
);

-- ================= PAYROLL, MONEY & LOANS =================
CREATE TABLE payroll (
    id               BIGSERIAL PRIMARY KEY,
    worker_id        BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    period_start     DATE NOT NULL,
    period_end       DATE NOT NULL,
    present_days     INT           NOT NULL DEFAULT 0,
    base_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    surplus_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
    grade_bonus      NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
    loan_deduction   NUMERIC(12,2) NOT NULL DEFAULT 0,
    advance_recovery NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_deduction  NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_payable      NUMERIC(12,2) NOT NULL DEFAULT 0,
    status           payroll_status NOT NULL DEFAULT 'draft',
    approved_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    paid_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (worker_id, period_start, period_end)
);

CREATE TABLE payroll_config (
    id               BIGSERIAL PRIMARY KEY,
    base_daily_wage  NUMERIC(12,2) NOT NULL DEFAULT 170.00,
    leaf_quota_kg    NUMERIC(10,2) NOT NULL DEFAULT 23.00,
    surplus_rate     NUMERIC(10,2) NOT NULL DEFAULT 5.00,
    grade_bonus_rate NUMERIC(10,2) NOT NULL DEFAULT 1.00,
    effective_from   DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_by       BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE withdrawal_request (
    id           BIGSERIAL PRIMARY KEY,
    worker_id    BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    amount       NUMERIC(12,2) NOT NULL,
    method       withdrawal_method NOT NULL DEFAULT 'bkash',
    status       withdrawal_status NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE TABLE finance_ledger (
    id          BIGSERIAL PRIMARY KEY,
    txn_type    txn_type NOT NULL,
    category    VARCHAR(80),
    amount      NUMERIC(14,2) NOT NULL,
    txn_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE loans (
    id                 BIGSERIAL PRIMARY KEY,
    worker_id          BIGINT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    principal          NUMERIC(12,2) NOT NULL,
    reason             VARCHAR(200),
    status             loan_status NOT NULL DEFAULT 'applied',
    interest_rate      NUMERIC(5,2) NOT NULL DEFAULT 0,   -- interest-free
    installment_amount NUMERIC(12,2),
    tenure_months      INT,
    approved_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
    applied_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    disbursed_at       TIMESTAMPTZ
);

CREATE TABLE loan_repayment (
    id         BIGSERIAL PRIMARY KEY,
    loan_id    BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    payroll_id BIGINT REFERENCES payroll(id) ON DELETE SET NULL,
    amount     NUMERIC(12,2) NOT NULL,
    repaid_on  DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE loan_ai_assessment (
    id               BIGSERIAL PRIMARY KEY,
    loan_id          BIGINT NOT NULL UNIQUE REFERENCES loans(id) ON DELETE CASCADE,
    risk_level       risk_level NOT NULL,
    suggested_amount NUMERIC(12,2),
    reason_en        TEXT,
    reason_bn        TEXT,
    model            VARCHAR(80),
    features_json    JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= INVENTORY & SUPPLY CHAIN =================
CREATE TABLE inventory_item (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    category      VARCHAR(80),
    unit          VARCHAR(20),
    quantity      NUMERIC(12,2) NOT NULL DEFAULT 0,
    reorder_level NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit_cost     NUMERIC(12,2),
    expiry_date   DATE
);

CREATE TABLE requisition (
    id           BIGSERIAL PRIMARY KEY,
    item_id      BIGINT NOT NULL REFERENCES inventory_item(id) ON DELETE CASCADE,
    requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    quantity     NUMERIC(12,2) NOT NULL,
    status       requisition_status NOT NULL DEFAULT 'pending',
    approved_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chemical_application (
    id           BIGSERIAL PRIMARY KEY,
    type         chemical_type NOT NULL,
    item_id      BIGINT REFERENCES inventory_item(id) ON DELETE SET NULL,
    zone_id      BIGINT REFERENCES zones(id) ON DELETE SET NULL,
    applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quantity     NUMERIC(12,2),
    applied_by   BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE supply_chain_shipment (
    id          BIGSERIAL PRIMARY KEY,
    batch_code  VARCHAR(60) NOT NULL,
    stage       shipment_stage NOT NULL,
    quantity_kg NUMERIC(12,2),
    from_loc    VARCHAR(120),
    to_loc      VARCHAR(120),
    status      VARCHAR(40),
    ship_date   DATE,
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- ================= WEATHER, COMMS, REPORTS & COMPLIANCE =================
CREATE TABLE weather_log (
    id            BIGSERIAL PRIMARY KEY,
    zone_id       BIGINT REFERENCES zones(id) ON DELETE CASCADE,
    log_date      DATE NOT NULL,
    temp_c        NUMERIC(5,2),
    humidity      NUMERIC(5,2),
    rainfall_mm   NUMERIC(6,2),
    condition     VARCHAR(80),
    source        VARCHAR(80),
    forecast_json JSONB
);

CREATE TABLE broadcast (
    id       BIGSERIAL PRIMARY KEY,
    title    VARCHAR(160) NOT NULL,
    message  TEXT NOT NULL,
    audience broadcast_audience NOT NULL DEFAULT 'all',
    channel  broadcast_channel  NOT NULL DEFAULT 'in_app',
    sent_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sms_log (
    id        BIGSERIAL PRIMARY KEY,
    worker_id BIGINT REFERENCES workers(id) ON DELETE SET NULL,
    phone     VARCHAR(20),
    message   TEXT NOT NULL,
    category  sms_category,
    status    sms_status NOT NULL DEFAULT 'mock',
    provider  VARCHAR(60),
    sent_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report (
    id              BIGSERIAL PRIMARY KEY,
    report_type     VARCHAR(80) NOT NULL,
    period          VARCHAR(40),
    content         TEXT,
    is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status          VARCHAR(40),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE complaint (
    id          BIGSERIAL PRIMARY KEY,
    worker_id   BIGINT REFERENCES workers(id) ON DELETE SET NULL,
    text        TEXT NOT NULL,
    text_bn     TEXT,
    category    VARCHAR(80),                 -- AI-filled
    priority    complaint_priority,          -- AI-filled
    sentiment   VARCHAR(40),                 -- AI-filled
    status      complaint_status NOT NULL DEFAULT 'open',
    assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance_record (
    id          BIGSERIAL PRIMARY KEY,
    type        VARCHAR(80) NOT NULL,
    description TEXT,
    status      compliance_status NOT NULL DEFAULT 'pending',
    due_date    DATE,
    owner_id    BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- ================= AI-SUPPORT (LLM / RAG / PREDICTION) =================
CREATE TABLE ai_query_log (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    role          VARCHAR(20),
    question      TEXT NOT NULL,
    generated_sql TEXT,
    answer        TEXT,
    latency_ms    INT,
    was_blocked   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_base (
    id          BIGSERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    source_type VARCHAR(60),
    raw_text    TEXT,
    uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_embedding (
    id            BIGSERIAL PRIMARY KEY,
    document_id   BIGINT NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
    chunk_text    TEXT NOT NULL,
    embedding     VECTOR(1536),
    metadata_json JSONB
);

CREATE TABLE ai_prediction (
    id              BIGSERIAL PRIMARY KEY,
    prediction_type prediction_type NOT NULL,
    zone_id         BIGINT REFERENCES zones(id) ON DELETE SET NULL,
    target_date     DATE,
    value_json      JSONB,
    model           VARCHAR(80),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= INDEXES =================
CREATE INDEX idx_workers_zone        ON workers(zone_id);
CREATE INDEX idx_workers_supervisor  ON workers(supervisor_id);
CREATE INDEX idx_attendance_worker   ON attendance(worker_id);
CREATE INDEX idx_attendance_date     ON attendance(work_date);
CREATE INDEX idx_leaf_worker         ON leaf_collection(worker_id);
CREATE INDEX idx_leaf_date           ON leaf_collection(collect_date);
CREATE INDEX idx_payroll_worker      ON payroll(worker_id);
CREATE INDEX idx_payroll_status      ON payroll(status);
CREATE INDEX idx_loans_worker        ON loans(worker_id);
CREATE INDEX idx_loans_status        ON loans(status);
CREATE INDEX idx_repay_loan          ON loan_repayment(loan_id);
CREATE INDEX idx_requisition_item    ON requisition(item_id);
CREATE INDEX idx_chem_zone           ON chemical_application(zone_id);
CREATE INDEX idx_weather_zone_date   ON weather_log(zone_id, log_date);
CREATE INDEX idx_complaint_status    ON complaint(status);
CREATE INDEX idx_aiquery_user        ON ai_query_log(user_id);
CREATE INDEX idx_docemb_document     ON document_embedding(document_id);

-- Vector similarity index for RAG (cosine). Safe to create before data is loaded.
CREATE INDEX idx_docemb_embedding ON document_embedding
    USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- End of V1. Future changes go in V2__*.sql, V3__*.sql, ...
-- ============================================================
