--
-- PostgreSQL database dump
--

\restrict 4uosefYeBwGbuh9o58GJ2XBBuDCaLmekyLeegyyAHJZcWLZuchlENigDhQ7euaW

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg12+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.attendance_status AS ENUM (
    'present',
    'absent',
    'leave'
);


ALTER TYPE public.attendance_status OWNER TO chaghor;

--
-- Name: broadcast_audience; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.broadcast_audience AS ENUM (
    'all',
    'zone',
    'role'
);


ALTER TYPE public.broadcast_audience OWNER TO chaghor;

--
-- Name: broadcast_channel; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.broadcast_channel AS ENUM (
    'in_app',
    'sms'
);


ALTER TYPE public.broadcast_channel OWNER TO chaghor;

--
-- Name: chemical_type; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.chemical_type AS ENUM (
    'fertilizer',
    'pesticide'
);


ALTER TYPE public.chemical_type OWNER TO chaghor;

--
-- Name: complaint_priority; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.complaint_priority AS ENUM (
    'low',
    'med',
    'high'
);


ALTER TYPE public.complaint_priority OWNER TO chaghor;

--
-- Name: complaint_status; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.complaint_status AS ENUM (
    'open',
    'in_progress',
    'resolved'
);


ALTER TYPE public.complaint_status OWNER TO chaghor;

--
-- Name: compliance_status; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.compliance_status AS ENUM (
    'pending',
    'met',
    'overdue'
);


ALTER TYPE public.compliance_status OWNER TO chaghor;

--
-- Name: leaf_grade; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.leaf_grade AS ENUM (
    'A',
    'B',
    'C'
);


ALTER TYPE public.leaf_grade OWNER TO chaghor;

--
-- Name: loan_status; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.loan_status AS ENUM (
    'applied',
    'ai_checked',
    'approved',
    'rejected',
    'disbursed',
    'repaying',
    'closed'
);


ALTER TYPE public.loan_status OWNER TO chaghor;

--
-- Name: locale_code; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.locale_code AS ENUM (
    'en',
    'bn'
);


ALTER TYPE public.locale_code OWNER TO chaghor;

--
-- Name: payroll_status; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.payroll_status AS ENUM (
    'draft',
    'review',
    'approved',
    'paid'
);


ALTER TYPE public.payroll_status OWNER TO chaghor;

--
-- Name: prediction_type; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.prediction_type AS ENUM (
    'yield',
    'anomaly',
    'reorder'
);


ALTER TYPE public.prediction_type OWNER TO chaghor;

--
-- Name: requisition_status; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.requisition_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE public.requisition_status OWNER TO chaghor;

--
-- Name: risk_level; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.risk_level AS ENUM (
    'low',
    'med',
    'high'
);


ALTER TYPE public.risk_level OWNER TO chaghor;

--
-- Name: schedule_status; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.schedule_status AS ENUM (
    'planned',
    'done'
);


ALTER TYPE public.schedule_status OWNER TO chaghor;

--
-- Name: shipment_stage; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.shipment_stage AS ENUM (
    'sourcing',
    'processing',
    'storage',
    'dispatch'
);


ALTER TYPE public.shipment_stage OWNER TO chaghor;

--
-- Name: sms_category; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.sms_category AS ENUM (
    'payroll',
    'loan',
    'withdrawal',
    'alert'
);


ALTER TYPE public.sms_category OWNER TO chaghor;

--
-- Name: sms_status; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.sms_status AS ENUM (
    'sent',
    'failed',
    'mock'
);


ALTER TYPE public.sms_status OWNER TO chaghor;

--
-- Name: txn_type; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.txn_type AS ENUM (
    'revenue',
    'expense'
);


ALTER TYPE public.txn_type OWNER TO chaghor;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'supervisor',
    'worker'
);


ALTER TYPE public.user_role OWNER TO chaghor;

--
-- Name: vision_subject; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.vision_subject AS ENUM (
    'leaf_grade',
    'pest'
);


ALTER TYPE public.vision_subject OWNER TO chaghor;

--
-- Name: withdrawal_method; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.withdrawal_method AS ENUM (
    'bkash'
);


ALTER TYPE public.withdrawal_method OWNER TO chaghor;

--
-- Name: withdrawal_status; Type: TYPE; Schema: public; Owner: chaghor
--

CREATE TYPE public.withdrawal_status AS ENUM (
    'pending',
    'paid',
    'rejected'
);


ALTER TYPE public.withdrawal_status OWNER TO chaghor;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_prediction; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.ai_prediction (
    id bigint NOT NULL,
    prediction_type public.prediction_type NOT NULL,
    zone_id bigint,
    target_date date,
    value_json jsonb,
    model character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_prediction OWNER TO chaghor;

--
-- Name: ai_prediction_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.ai_prediction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_prediction_id_seq OWNER TO chaghor;

--
-- Name: ai_prediction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.ai_prediction_id_seq OWNED BY public.ai_prediction.id;


--
-- Name: ai_query_log; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.ai_query_log (
    id bigint NOT NULL,
    user_id bigint,
    role character varying(20),
    question text NOT NULL,
    generated_sql text,
    answer text,
    latency_ms integer,
    was_blocked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_query_log OWNER TO chaghor;

--
-- Name: ai_query_log_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.ai_query_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_query_log_id_seq OWNER TO chaghor;

--
-- Name: ai_query_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.ai_query_log_id_seq OWNED BY public.ai_query_log.id;


--
-- Name: app_setting; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.app_setting (
    id bigint NOT NULL,
    estate_name character varying(160) DEFAULT 'Cha-Ghor Estate'::character varying NOT NULL,
    logo_url text,
    currency character varying(8) DEFAULT '৳'::character varying NOT NULL,
    updated_by bigint,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_setting_singleton CHECK ((id = 1))
);


ALTER TABLE public.app_setting OWNER TO chaghor;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.attendance (
    id bigint NOT NULL,
    worker_id bigint NOT NULL,
    work_date date NOT NULL,
    status public.attendance_status NOT NULL,
    zone_id bigint,
    marked_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.attendance OWNER TO chaghor;

--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.attendance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_id_seq OWNER TO chaghor;

--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: broadcast; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.broadcast (
    id bigint NOT NULL,
    title character varying(160) NOT NULL,
    message text NOT NULL,
    audience public.broadcast_audience DEFAULT 'all'::public.broadcast_audience NOT NULL,
    channel public.broadcast_channel DEFAULT 'in_app'::public.broadcast_channel NOT NULL,
    sent_by bigint,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.broadcast OWNER TO chaghor;

--
-- Name: broadcast_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.broadcast_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.broadcast_id_seq OWNER TO chaghor;

--
-- Name: broadcast_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.broadcast_id_seq OWNED BY public.broadcast.id;


--
-- Name: case_reply; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.case_reply (
    id bigint NOT NULL,
    case_id bigint NOT NULL,
    author_name character varying(120) DEFAULT ''::character varying NOT NULL,
    author_role character varying(30) DEFAULT ''::character varying NOT NULL,
    author_id bigint,
    body text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.case_reply OWNER TO chaghor;

--
-- Name: case_reply_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.case_reply_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.case_reply_id_seq OWNER TO chaghor;

--
-- Name: case_reply_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.case_reply_id_seq OWNED BY public.case_reply.id;


--
-- Name: chemical_application; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.chemical_application (
    id bigint NOT NULL,
    type public.chemical_type NOT NULL,
    item_id bigint,
    zone_id bigint,
    applied_date date DEFAULT CURRENT_DATE NOT NULL,
    quantity numeric(12,2),
    applied_by bigint
);


ALTER TABLE public.chemical_application OWNER TO chaghor;

--
-- Name: chemical_application_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.chemical_application_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.chemical_application_id_seq OWNER TO chaghor;

--
-- Name: chemical_application_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.chemical_application_id_seq OWNED BY public.chemical_application.id;


--
-- Name: complaint; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.complaint (
    id bigint NOT NULL,
    worker_id bigint,
    text text NOT NULL,
    text_bn text,
    category character varying(80),
    priority public.complaint_priority,
    sentiment character varying(40),
    status public.complaint_status DEFAULT 'open'::public.complaint_status NOT NULL,
    assigned_to bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.complaint OWNER TO chaghor;

--
-- Name: complaint_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.complaint_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.complaint_id_seq OWNER TO chaghor;

--
-- Name: complaint_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.complaint_id_seq OWNED BY public.complaint.id;


--
-- Name: compliance_record; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.compliance_record (
    id bigint NOT NULL,
    type character varying(80) NOT NULL,
    description text,
    status public.compliance_status DEFAULT 'pending'::public.compliance_status NOT NULL,
    due_date date,
    owner_id bigint
);


ALTER TABLE public.compliance_record OWNER TO chaghor;

--
-- Name: compliance_record_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.compliance_record_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.compliance_record_id_seq OWNER TO chaghor;

--
-- Name: compliance_record_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.compliance_record_id_seq OWNED BY public.compliance_record.id;


--
-- Name: document_embedding; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.document_embedding (
    id bigint NOT NULL,
    document_id bigint NOT NULL,
    chunk_text text NOT NULL,
    embedding public.vector(1536),
    metadata_json jsonb
);


ALTER TABLE public.document_embedding OWNER TO chaghor;

--
-- Name: document_embedding_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.document_embedding_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.document_embedding_id_seq OWNER TO chaghor;

--
-- Name: document_embedding_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.document_embedding_id_seq OWNED BY public.document_embedding.id;


--
-- Name: field_case; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.field_case (
    id bigint NOT NULL,
    case_type character varying(20) DEFAULT 'COMPLAINT'::character varying NOT NULL,
    category character varying(60) DEFAULT ''::character varying NOT NULL,
    title character varying(200) DEFAULT ''::character varying NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    submitter_name character varying(120) DEFAULT ''::character varying NOT NULL,
    submitter_role character varying(30) DEFAULT ''::character varying NOT NULL,
    submitted_by bigint,
    worker_code character varying(30),
    zone character varying(40),
    priority character varying(20) DEFAULT 'MEDIUM'::character varying NOT NULL,
    status character varying(20) DEFAULT 'OPEN'::character varying NOT NULL,
    evidence_url text,
    assigned_to bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    first_response_at timestamp with time zone,
    resolved_at timestamp with time zone
);


ALTER TABLE public.field_case OWNER TO chaghor;

--
-- Name: field_case_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.field_case_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.field_case_id_seq OWNER TO chaghor;

--
-- Name: field_case_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.field_case_id_seq OWNED BY public.field_case.id;


--
-- Name: finance_ledger; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.finance_ledger (
    id bigint NOT NULL,
    txn_type public.txn_type,
    category character varying(80),
    amount numeric(14,2) NOT NULL,
    txn_date date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    created_by bigint,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    ref_id character varying(40),
    account character varying(160) DEFAULT ''::character varying NOT NULL,
    status character varying(20) DEFAULT 'SETTLED'::character varying NOT NULL,
    due_date date,
    note text,
    source_type character varying(20),
    source_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.finance_ledger OWNER TO chaghor;

--
-- Name: finance_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.finance_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.finance_ledger_id_seq OWNER TO chaghor;

--
-- Name: finance_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.finance_ledger_id_seq OWNED BY public.finance_ledger.id;


--
-- Name: flyway_schema_history; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.flyway_schema_history (
    installed_rank integer NOT NULL,
    version character varying(50),
    description character varying(200) NOT NULL,
    type character varying(20) NOT NULL,
    script character varying(1000) NOT NULL,
    checksum integer,
    installed_by character varying(100) NOT NULL,
    installed_on timestamp without time zone DEFAULT now() NOT NULL,
    execution_time integer NOT NULL,
    success boolean NOT NULL
);


ALTER TABLE public.flyway_schema_history OWNER TO chaghor;

--
-- Name: harvest_schedule; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.harvest_schedule (
    id bigint NOT NULL,
    zone_id bigint NOT NULL,
    sched_date date NOT NULL,
    task character varying(160),
    supervisor_id bigint,
    status public.schedule_status DEFAULT 'planned'::public.schedule_status NOT NULL
);


ALTER TABLE public.harvest_schedule OWNER TO chaghor;

--
-- Name: harvest_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.harvest_schedule_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.harvest_schedule_id_seq OWNER TO chaghor;

--
-- Name: harvest_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.harvest_schedule_id_seq OWNED BY public.harvest_schedule.id;


--
-- Name: inventory_item; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.inventory_item (
    id bigint NOT NULL,
    name character varying(120) NOT NULL,
    category character varying(80),
    unit character varying(20),
    quantity numeric(12,2) DEFAULT 0 NOT NULL,
    reorder_level numeric(12,2) DEFAULT 0 NOT NULL,
    unit_cost numeric(12,2),
    expiry_date date,
    code_label character varying(40),
    code_value character varying(80),
    capacity numeric(12,2) DEFAULT 0 NOT NULL,
    unit_value numeric(12,2) DEFAULT 0 NOT NULL,
    site character varying(40) DEFAULT 'Central Hub'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.inventory_item OWNER TO chaghor;

--
-- Name: inventory_item_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.inventory_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_item_id_seq OWNER TO chaghor;

--
-- Name: inventory_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.inventory_item_id_seq OWNED BY public.inventory_item.id;


--
-- Name: knowledge_base; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.knowledge_base (
    id bigint NOT NULL,
    title character varying(200) NOT NULL,
    source_type character varying(60),
    raw_text text,
    uploaded_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.knowledge_base OWNER TO chaghor;

--
-- Name: knowledge_base_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.knowledge_base_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knowledge_base_id_seq OWNER TO chaghor;

--
-- Name: knowledge_base_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.knowledge_base_id_seq OWNED BY public.knowledge_base.id;


--
-- Name: leaf_collection; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.leaf_collection (
    id bigint NOT NULL,
    worker_id bigint NOT NULL,
    zone_id bigint,
    collect_date date NOT NULL,
    weight_kg numeric(10,2) DEFAULT 0 NOT NULL,
    quality_grade public.leaf_grade,
    photo_id bigint,
    recorded_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.leaf_collection OWNER TO chaghor;

--
-- Name: leaf_collection_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.leaf_collection_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leaf_collection_id_seq OWNER TO chaghor;

--
-- Name: leaf_collection_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.leaf_collection_id_seq OWNED BY public.leaf_collection.id;


--
-- Name: loan; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.loan (
    id bigint NOT NULL,
    reference character varying(40),
    worker_name character varying(120) DEFAULT ''::character varying NOT NULL,
    zone character varying(20),
    avatar_url text,
    principal numeric(12,2) DEFAULT 0 NOT NULL,
    reason character varying(200),
    repaid numeric(12,2) DEFAULT 0 NOT NULL,
    daily_deduction numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by bigint
);


ALTER TABLE public.loan OWNER TO chaghor;

--
-- Name: loan_ai_assessment; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.loan_ai_assessment (
    id bigint NOT NULL,
    loan_id bigint NOT NULL,
    risk_level public.risk_level NOT NULL,
    suggested_amount numeric(12,2),
    reason_en text,
    reason_bn text,
    model character varying(80),
    features_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.loan_ai_assessment OWNER TO chaghor;

--
-- Name: loan_ai_assessment_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.loan_ai_assessment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.loan_ai_assessment_id_seq OWNER TO chaghor;

--
-- Name: loan_ai_assessment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.loan_ai_assessment_id_seq OWNED BY public.loan_ai_assessment.id;


--
-- Name: loan_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.loan_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.loan_id_seq OWNER TO chaghor;

--
-- Name: loan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.loan_id_seq OWNED BY public.loan.id;


--
-- Name: loan_repayment; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.loan_repayment (
    id bigint NOT NULL,
    loan_id bigint NOT NULL,
    payroll_id bigint,
    amount numeric(12,2) NOT NULL,
    repaid_on date DEFAULT CURRENT_DATE NOT NULL
);


ALTER TABLE public.loan_repayment OWNER TO chaghor;

--
-- Name: loan_repayment_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.loan_repayment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.loan_repayment_id_seq OWNER TO chaghor;

--
-- Name: loan_repayment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.loan_repayment_id_seq OWNED BY public.loan_repayment.id;


--
-- Name: loans; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.loans (
    id bigint NOT NULL,
    worker_id bigint NOT NULL,
    principal numeric(12,2) NOT NULL,
    reason character varying(200),
    status public.loan_status DEFAULT 'applied'::public.loan_status NOT NULL,
    interest_rate numeric(5,2) DEFAULT 0 NOT NULL,
    installment_amount numeric(12,2),
    tenure_months integer,
    approved_by bigint,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    disbursed_at timestamp with time zone
);


ALTER TABLE public.loans OWNER TO chaghor;

--
-- Name: loans_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.loans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.loans_id_seq OWNER TO chaghor;

--
-- Name: loans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.loans_id_seq OWNED BY public.loans.id;


--
-- Name: payroll; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.payroll (
    id bigint NOT NULL,
    worker_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    present_days integer DEFAULT 0 NOT NULL,
    base_amount numeric(12,2) DEFAULT 0 NOT NULL,
    surplus_amount numeric(12,2) DEFAULT 0 NOT NULL,
    grade_bonus numeric(12,2) DEFAULT 0 NOT NULL,
    gross_amount numeric(12,2) DEFAULT 0 NOT NULL,
    loan_deduction numeric(12,2) DEFAULT 0 NOT NULL,
    advance_recovery numeric(12,2) DEFAULT 0 NOT NULL,
    other_deduction numeric(12,2) DEFAULT 0 NOT NULL,
    net_payable numeric(12,2) DEFAULT 0 NOT NULL,
    status public.payroll_status DEFAULT 'draft'::public.payroll_status NOT NULL,
    approved_by bigint,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payroll OWNER TO chaghor;

--
-- Name: payroll_config; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.payroll_config (
    id bigint NOT NULL,
    base_daily_wage numeric(12,2) DEFAULT 170.00 NOT NULL,
    leaf_quota_kg numeric(10,2) DEFAULT 23.00 NOT NULL,
    surplus_rate numeric(10,2) DEFAULT 5.00 NOT NULL,
    grade_bonus_rate numeric(10,2) DEFAULT 1.00 NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    updated_by bigint
);


ALTER TABLE public.payroll_config OWNER TO chaghor;

--
-- Name: payroll_config_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.payroll_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payroll_config_id_seq OWNER TO chaghor;

--
-- Name: payroll_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.payroll_config_id_seq OWNED BY public.payroll_config.id;


--
-- Name: payroll_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.payroll_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payroll_id_seq OWNER TO chaghor;

--
-- Name: payroll_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.payroll_id_seq OWNED BY public.payroll.id;


--
-- Name: report; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.report (
    id bigint NOT NULL,
    report_type character varying(80) NOT NULL,
    period character varying(40),
    content text,
    is_ai_generated boolean DEFAULT false NOT NULL,
    created_by bigint,
    status character varying(40),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.report OWNER TO chaghor;

--
-- Name: report_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.report_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.report_id_seq OWNER TO chaghor;

--
-- Name: report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.report_id_seq OWNED BY public.report.id;


--
-- Name: requisition; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.requisition (
    id bigint NOT NULL,
    item_id bigint,
    requested_by bigint,
    quantity numeric(12,2),
    status character varying(20) DEFAULT 'pending'::public.requisition_status NOT NULL,
    approved_by bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    item_label character varying(160) DEFAULT ''::character varying NOT NULL,
    requester character varying(120) DEFAULT ''::character varying NOT NULL,
    detail character varying(160),
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by bigint
);


ALTER TABLE public.requisition OWNER TO chaghor;

--
-- Name: requisition_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.requisition_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.requisition_id_seq OWNER TO chaghor;

--
-- Name: requisition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.requisition_id_seq OWNED BY public.requisition.id;


--
-- Name: sales_transaction; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.sales_transaction (
    id bigint NOT NULL,
    trx_id character varying(40) DEFAULT ''::character varying NOT NULL,
    txn_date date DEFAULT CURRENT_DATE NOT NULL,
    grade character varying(40) DEFAULT ''::character varying NOT NULL,
    batch_code character varying(40),
    buyer character varying(120) DEFAULT ''::character varying NOT NULL,
    volume_kg numeric(12,2) DEFAULT 0 NOT NULL,
    rate_per_kg numeric(14,2) DEFAULT 0 NOT NULL,
    net_revenue numeric(14,2) DEFAULT 0 NOT NULL,
    pay_status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    ship_status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sales_transaction OWNER TO chaghor;

--
-- Name: sales_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.sales_transaction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sales_transaction_id_seq OWNER TO chaghor;

--
-- Name: sales_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.sales_transaction_id_seq OWNED BY public.sales_transaction.id;


--
-- Name: saved_report; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.saved_report (
    id bigint NOT NULL,
    title character varying(160) DEFAULT ''::character varying NOT NULL,
    report_type character varying(30) DEFAULT 'MONTHLY'::character varying NOT NULL,
    period_start date DEFAULT CURRENT_DATE NOT NULL,
    period_end date DEFAULT CURRENT_DATE NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    summary text,
    revenue numeric(14,2) DEFAULT 0 NOT NULL,
    expense numeric(14,2) DEFAULT 0 NOT NULL,
    net_profit numeric(14,2) DEFAULT 0 NOT NULL,
    generated_by bigint,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_at timestamp with time zone
);


ALTER TABLE public.saved_report OWNER TO chaghor;

--
-- Name: saved_report_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.saved_report_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.saved_report_id_seq OWNER TO chaghor;

--
-- Name: saved_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.saved_report_id_seq OWNED BY public.saved_report.id;


--
-- Name: shipment; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.shipment (
    id bigint NOT NULL,
    code character varying(40) DEFAULT ''::character varying NOT NULL,
    vehicle character varying(40),
    origin character varying(80) DEFAULT ''::character varying NOT NULL,
    destination character varying(80) DEFAULT ''::character varying NOT NULL,
    weight_kg numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'LOADING'::character varying NOT NULL,
    on_time boolean DEFAULT true NOT NULL,
    eta_text character varying(60),
    speed_kmh integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    track_token character varying(40) NOT NULL,
    current_lat numeric(9,6),
    current_lng numeric(9,6),
    heading_deg numeric(5,1),
    last_ping_at timestamp with time zone
);


ALTER TABLE public.shipment OWNER TO chaghor;

--
-- Name: shipment_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.shipment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.shipment_id_seq OWNER TO chaghor;

--
-- Name: shipment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.shipment_id_seq OWNED BY public.shipment.id;


--
-- Name: sms_log; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.sms_log (
    id bigint NOT NULL,
    worker_id bigint,
    phone character varying(20),
    message text NOT NULL,
    category public.sms_category,
    status public.sms_status DEFAULT 'mock'::public.sms_status NOT NULL,
    provider character varying(60),
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sms_log OWNER TO chaghor;

--
-- Name: sms_log_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.sms_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sms_log_id_seq OWNER TO chaghor;

--
-- Name: sms_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.sms_log_id_seq OWNED BY public.sms_log.id;


--
-- Name: supervisor_zone; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.supervisor_zone (
    id bigint NOT NULL,
    supervisor_id bigint NOT NULL,
    zone_id bigint NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.supervisor_zone OWNER TO chaghor;

--
-- Name: supervisor_zone_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.supervisor_zone_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.supervisor_zone_id_seq OWNER TO chaghor;

--
-- Name: supervisor_zone_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.supervisor_zone_id_seq OWNED BY public.supervisor_zone.id;


--
-- Name: supply_chain_shipment; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.supply_chain_shipment (
    id bigint NOT NULL,
    batch_code character varying(60) NOT NULL,
    stage public.shipment_stage NOT NULL,
    quantity_kg numeric(12,2),
    from_loc character varying(120),
    to_loc character varying(120),
    status character varying(40),
    ship_date date,
    created_by bigint
);


ALTER TABLE public.supply_chain_shipment OWNER TO chaghor;

--
-- Name: supply_chain_shipment_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.supply_chain_shipment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.supply_chain_shipment_id_seq OWNER TO chaghor;

--
-- Name: supply_chain_shipment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.supply_chain_shipment_id_seq OWNED BY public.supply_chain_shipment.id;


--
-- Name: tea_batch; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.tea_batch (
    id bigint NOT NULL,
    batch_code character varying(40) DEFAULT ''::character varying NOT NULL,
    grade character varying(40) DEFAULT ''::character varying NOT NULL,
    quality_pct numeric(5,2),
    quality_note character varying(80),
    stage character varying(30) DEFAULT 'PROCESSING'::character varying NOT NULL,
    weight_kg numeric(12,2) DEFAULT 0 NOT NULL,
    readiness character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tea_batch OWNER TO chaghor;

--
-- Name: tea_batch_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.tea_batch_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tea_batch_id_seq OWNER TO chaghor;

--
-- Name: tea_batch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.tea_batch_id_seq OWNED BY public.tea_batch.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    username character varying(60) NOT NULL,
    email character varying(160),
    password_hash character varying(255) NOT NULL,
    role public.user_role NOT NULL,
    locale public.locale_code DEFAULT 'en'::public.locale_code NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name character varying(120),
    phone character varying(30),
    avatar_url text,
    notify_broadcast boolean DEFAULT true NOT NULL,
    notify_attendance boolean DEFAULT true NOT NULL,
    notify_payroll boolean DEFAULT true NOT NULL
);


ALTER TABLE public.users OWNER TO chaghor;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO chaghor;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: workers; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.workers (
    id bigint NOT NULL,
    user_id bigint,
    full_name character varying(160) NOT NULL,
    name_bn character varying(160),
    phone character varying(20),
    national_id character varying(40),
    dob date,
    zone_id bigint,
    supervisor_id bigint,
    join_date date,
    daily_wage numeric(12,2) DEFAULT 170.00 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    photo_url character varying(300),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    job_role character varying(30) DEFAULT 'plucker'::character varying NOT NULL
);


ALTER TABLE public.workers OWNER TO chaghor;

--
-- Name: zones; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.zones (
    id bigint NOT NULL,
    name character varying(120) NOT NULL,
    code character varying(40) NOT NULL,
    area_hectare numeric(10,2),
    polygon_geojson jsonb,
    target_kg_per_day numeric(10,2)
);


ALTER TABLE public.zones OWNER TO chaghor;

--
-- Name: view_attendance; Type: VIEW; Schema: public; Owner: chaghor
--

CREATE VIEW public.view_attendance AS
 SELECT a.id AS attendance_id,
    a.work_date,
    a.status,
    w.id AS worker_id,
    w.full_name,
    w.job_role,
    z.name AS zone_name
   FROM ((public.attendance a
     JOIN public.workers w ON ((w.id = a.worker_id)))
     LEFT JOIN public.zones z ON ((z.id = a.zone_id)));


ALTER VIEW public.view_attendance OWNER TO chaghor;

--
-- Name: VIEW view_attendance; Type: COMMENT; Schema: public; Owner: chaghor
--

COMMENT ON VIEW public.view_attendance IS 'Cha Bot: attendance history with worker + zone names.';


--
-- Name: view_worker; Type: VIEW; Schema: public; Owner: chaghor
--

CREATE VIEW public.view_worker AS
 SELECT w.id AS worker_id,
    w.full_name,
    w.name_bn,
    w.phone,
    w.job_role,
    w.status,
    w.daily_wage,
    w.join_date,
    w.dob,
    z.name AS zone_name,
    z.code AS zone_code,
    s.username AS supervisor_username
   FROM ((public.workers w
     LEFT JOIN public.zones z ON ((z.id = w.zone_id)))
     LEFT JOIN public.users s ON ((s.id = w.supervisor_id)));


ALTER VIEW public.view_worker OWNER TO chaghor;

--
-- Name: VIEW view_worker; Type: COMMENT; Schema: public; Owner: chaghor
--

COMMENT ON VIEW public.view_worker IS 'Cha Bot: safe worker directory (no national_id).';


--
-- Name: vision_inference; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.vision_inference (
    id bigint NOT NULL,
    subject_type public.vision_subject NOT NULL,
    subject_ref character varying(80),
    image_url character varying(300),
    label character varying(80),
    confidence numeric(5,4),
    model character varying(80),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vision_inference OWNER TO chaghor;

--
-- Name: vision_inference_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.vision_inference_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vision_inference_id_seq OWNER TO chaghor;

--
-- Name: vision_inference_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.vision_inference_id_seq OWNED BY public.vision_inference.id;


--
-- Name: warehouse; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.warehouse (
    id bigint NOT NULL,
    name character varying(120) NOT NULL,
    lat numeric(9,6) NOT NULL,
    lng numeric(9,6) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.warehouse OWNER TO chaghor;

--
-- Name: weather_log; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.weather_log (
    id bigint NOT NULL,
    zone_id bigint,
    log_date date NOT NULL,
    temp_c numeric(5,2),
    humidity numeric(5,2),
    rainfall_mm numeric(6,2),
    condition character varying(80),
    source character varying(80),
    forecast_json jsonb
);


ALTER TABLE public.weather_log OWNER TO chaghor;

--
-- Name: weather_log_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.weather_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.weather_log_id_seq OWNER TO chaghor;

--
-- Name: weather_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.weather_log_id_seq OWNED BY public.weather_log.id;


--
-- Name: withdrawal_request; Type: TABLE; Schema: public; Owner: chaghor
--

CREATE TABLE public.withdrawal_request (
    id bigint NOT NULL,
    worker_id bigint NOT NULL,
    amount numeric(12,2) NOT NULL,
    method public.withdrawal_method DEFAULT 'bkash'::public.withdrawal_method NOT NULL,
    status public.withdrawal_status DEFAULT 'pending'::public.withdrawal_status NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


ALTER TABLE public.withdrawal_request OWNER TO chaghor;

--
-- Name: withdrawal_request_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.withdrawal_request_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.withdrawal_request_id_seq OWNER TO chaghor;

--
-- Name: withdrawal_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.withdrawal_request_id_seq OWNED BY public.withdrawal_request.id;


--
-- Name: workers_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.workers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workers_id_seq OWNER TO chaghor;

--
-- Name: workers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.workers_id_seq OWNED BY public.workers.id;


--
-- Name: zones_id_seq; Type: SEQUENCE; Schema: public; Owner: chaghor
--

CREATE SEQUENCE public.zones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.zones_id_seq OWNER TO chaghor;

--
-- Name: zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: chaghor
--

ALTER SEQUENCE public.zones_id_seq OWNED BY public.zones.id;


--
-- Name: ai_prediction id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.ai_prediction ALTER COLUMN id SET DEFAULT nextval('public.ai_prediction_id_seq'::regclass);


--
-- Name: ai_query_log id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.ai_query_log ALTER COLUMN id SET DEFAULT nextval('public.ai_query_log_id_seq'::regclass);


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: broadcast id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.broadcast ALTER COLUMN id SET DEFAULT nextval('public.broadcast_id_seq'::regclass);


--
-- Name: case_reply id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.case_reply ALTER COLUMN id SET DEFAULT nextval('public.case_reply_id_seq'::regclass);


--
-- Name: chemical_application id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.chemical_application ALTER COLUMN id SET DEFAULT nextval('public.chemical_application_id_seq'::regclass);


--
-- Name: complaint id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.complaint ALTER COLUMN id SET DEFAULT nextval('public.complaint_id_seq'::regclass);


--
-- Name: compliance_record id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.compliance_record ALTER COLUMN id SET DEFAULT nextval('public.compliance_record_id_seq'::regclass);


--
-- Name: document_embedding id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.document_embedding ALTER COLUMN id SET DEFAULT nextval('public.document_embedding_id_seq'::regclass);


--
-- Name: field_case id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.field_case ALTER COLUMN id SET DEFAULT nextval('public.field_case_id_seq'::regclass);


--
-- Name: finance_ledger id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.finance_ledger ALTER COLUMN id SET DEFAULT nextval('public.finance_ledger_id_seq'::regclass);


--
-- Name: harvest_schedule id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.harvest_schedule ALTER COLUMN id SET DEFAULT nextval('public.harvest_schedule_id_seq'::regclass);


--
-- Name: inventory_item id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.inventory_item ALTER COLUMN id SET DEFAULT nextval('public.inventory_item_id_seq'::regclass);


--
-- Name: knowledge_base id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.knowledge_base ALTER COLUMN id SET DEFAULT nextval('public.knowledge_base_id_seq'::regclass);


--
-- Name: leaf_collection id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.leaf_collection ALTER COLUMN id SET DEFAULT nextval('public.leaf_collection_id_seq'::regclass);


--
-- Name: loan id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan ALTER COLUMN id SET DEFAULT nextval('public.loan_id_seq'::regclass);


--
-- Name: loan_ai_assessment id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan_ai_assessment ALTER COLUMN id SET DEFAULT nextval('public.loan_ai_assessment_id_seq'::regclass);


--
-- Name: loan_repayment id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan_repayment ALTER COLUMN id SET DEFAULT nextval('public.loan_repayment_id_seq'::regclass);


--
-- Name: loans id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loans ALTER COLUMN id SET DEFAULT nextval('public.loans_id_seq'::regclass);


--
-- Name: payroll id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.payroll ALTER COLUMN id SET DEFAULT nextval('public.payroll_id_seq'::regclass);


--
-- Name: payroll_config id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.payroll_config ALTER COLUMN id SET DEFAULT nextval('public.payroll_config_id_seq'::regclass);


--
-- Name: report id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.report ALTER COLUMN id SET DEFAULT nextval('public.report_id_seq'::regclass);


--
-- Name: requisition id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.requisition ALTER COLUMN id SET DEFAULT nextval('public.requisition_id_seq'::regclass);


--
-- Name: sales_transaction id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.sales_transaction ALTER COLUMN id SET DEFAULT nextval('public.sales_transaction_id_seq'::regclass);


--
-- Name: saved_report id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.saved_report ALTER COLUMN id SET DEFAULT nextval('public.saved_report_id_seq'::regclass);


--
-- Name: shipment id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.shipment ALTER COLUMN id SET DEFAULT nextval('public.shipment_id_seq'::regclass);


--
-- Name: sms_log id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.sms_log ALTER COLUMN id SET DEFAULT nextval('public.sms_log_id_seq'::regclass);


--
-- Name: supervisor_zone id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.supervisor_zone ALTER COLUMN id SET DEFAULT nextval('public.supervisor_zone_id_seq'::regclass);


--
-- Name: supply_chain_shipment id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.supply_chain_shipment ALTER COLUMN id SET DEFAULT nextval('public.supply_chain_shipment_id_seq'::regclass);


--
-- Name: tea_batch id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.tea_batch ALTER COLUMN id SET DEFAULT nextval('public.tea_batch_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vision_inference id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.vision_inference ALTER COLUMN id SET DEFAULT nextval('public.vision_inference_id_seq'::regclass);


--
-- Name: weather_log id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.weather_log ALTER COLUMN id SET DEFAULT nextval('public.weather_log_id_seq'::regclass);


--
-- Name: withdrawal_request id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.withdrawal_request ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_request_id_seq'::regclass);


--
-- Name: workers id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.workers ALTER COLUMN id SET DEFAULT nextval('public.workers_id_seq'::regclass);


--
-- Name: zones id; Type: DEFAULT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.zones ALTER COLUMN id SET DEFAULT nextval('public.zones_id_seq'::regclass);


--
-- Data for Name: ai_prediction; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.ai_prediction (id, prediction_type, zone_id, target_date, value_json, model, created_at) FROM stdin;
\.


--
-- Data for Name: ai_query_log; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.ai_query_log (id, user_id, role, question, generated_sql, answer, latency_ms, was_blocked, created_at) FROM stdin;
\.


--
-- Data for Name: app_setting; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.app_setting (id, estate_name, logo_url, currency, updated_by, updated_at) FROM stdin;
1	Cha-Ghor Estate	data:image/jpeg;base64,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	৳	1	2026-07-16 08:42:35.514122+00
\.


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.attendance (id, worker_id, work_date, status, zone_id, marked_by, created_at) FROM stdin;
\.


--
-- Data for Name: broadcast; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.broadcast (id, title, message, audience, channel, sent_by, sent_at) FROM stdin;
\.


--
-- Data for Name: case_reply; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.case_reply (id, case_id, author_name, author_role, author_id, body, created_at) FROM stdin;
1	2	Hamidum Mazid	admin	\N	Thanks for flagging. Parts have been ordered from the Sylhet depot and a mechanic is scheduled for tomorrow morning. Please keep the tractor idle until then.	2026-07-17 01:42:20.956204+00
\.


--
-- Data for Name: chemical_application; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.chemical_application (id, type, item_id, zone_id, applied_date, quantity, applied_by) FROM stdin;
\.


--
-- Data for Name: complaint; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.complaint (id, worker_id, text, text_bn, category, priority, sentiment, status, assigned_to, created_at) FROM stdin;
\.


--
-- Data for Name: compliance_record; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.compliance_record (id, type, description, status, due_date, owner_id) FROM stdin;
\.


--
-- Data for Name: document_embedding; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.document_embedding (id, document_id, chunk_text, embedding, metadata_json) FROM stdin;
\.


--
-- Data for Name: field_case; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.field_case (id, case_type, category, title, body, submitter_name, submitter_role, submitted_by, worker_code, zone, priority, status, evidence_url, assigned_to, created_at, first_response_at, resolved_at) FROM stdin;
1	COMPLAINT	Financial . Sector B1	কর্মীর অভিযোগ – মজুরি প্রদানে বিলম্বের সমস্যা	আমি সেক্টর বি-তে কাজ করি, কিন্তু গত শুক্রবার নির্ধারিত সাপ্তাহিক মজুরি এখনো পাইনি। এর ফলে আমার কাজে ও দৈনন্দিন জীবনে সমস্যার সৃষ্টি হয়েছে।	Zawad	worker	\N	CG418	A1	HIGH	OPEN	\N	\N	2026-07-17 02:42:20.956204+00	\N	\N
2	REPORT	Maintenance	Tractor T-04 Engine Failure	Primary plucking tractor has broken down in North Estate. Requires immediate parts replacement before the next harvest cycle.	Rahman Shakib	supervisor	\N	\N	North Estate	URGENT	IN_PROGRESS	\N	\N	2026-07-16 23:42:20.956204+00	2026-07-17 01:42:20.956204+00	\N
3	COMPLAINT	Financial	Overtime hours not counted	Last week's overtime was missing from my payslip.	Karim Uddin	worker	\N	CG221	B2	MEDIUM	RESOLVED	\N	\N	2026-07-11 04:42:20.956204+00	2026-07-11 06:42:20.956204+00	2026-07-12 04:42:20.956204+00
4	REPORT	Irrigation	Blocked irrigation channel in Sector C	Water not reaching the lower rows in Sector C.	Nazma Begum	supervisor	\N	\N	C1	HIGH	RESOLVED	\N	\N	2026-07-08 04:42:20.956204+00	2026-07-08 05:42:20.956204+00	2026-07-09 04:42:20.956204+00
5	COMPLAINT	Welfare	Drinking water shortage at rest shed	No drinking water at the east rest shed during afternoon shift.	Sultana Razia	worker	\N	CG377	A2	MEDIUM	RESOLVED	\N	\N	2026-07-05 04:42:20.956204+00	2026-07-05 07:42:20.956204+00	2026-07-06 04:42:20.956204+00
6	REPORT	Maintenance	Weighing scale reading inaccurately	Sector A leaf-weighing scale is off by about 2 kg.	Rahman Shakib	supervisor	\N	\N	A1	MEDIUM	RESOLVED	\N	\N	2026-07-03 04:42:20.956204+00	2026-07-03 08:42:20.956204+00	2026-07-04 04:42:20.956204+00
7	COMPLAINT	Financial	Advance deduction dispute	Loan deduction seems higher than agreed this month.	Josim Mia	worker	\N	CG104	B1	MEDIUM	RESOLVED	\N	\N	2026-06-30 04:42:20.956204+00	2026-06-30 06:42:20.956204+00	2026-07-01 04:42:20.956204+00
8	REPORT	Safety	Slippery path near drying yard	Path near the drying yard is slippery after rain.	Abdul Halim	supervisor	\N	\N	Yard	LOW	RESOLVED	\N	\N	2026-06-27 04:42:20.956204+00	2026-06-27 09:42:20.956204+00	2026-06-29 04:42:20.956204+00
9	COMPLAINT	Welfare	Request for additional rain gear	Team needs more raincoats for monsoon plucking.	Rekha Rani	worker	\N	CG289	C2	LOW	RESOLVED	\N	\N	2026-06-24 04:42:20.956204+00	2026-06-24 10:42:20.956204+00	2026-06-26 04:42:20.956204+00
10	REPORT	Maintenance	Fertilizer sprayer nozzle clogged	Backpack sprayer nozzle repeatedly clogging in Sector B.	Nazma Begum	supervisor	\N	\N	B2	MEDIUM	RESOLVED	\N	\N	2026-06-21 04:42:20.956204+00	2026-06-21 05:42:20.956204+00	2026-06-22 04:42:20.956204+00
11	COMPLAINT	Financial	Festival bonus not reflected	Festival bonus not yet credited to my account.	Karim Uddin	worker	\N	CG221	B2	MEDIUM	RESOLVED	\N	\N	2026-06-18 04:42:20.956204+00	2026-06-18 07:42:20.956204+00	2026-06-20 04:42:20.956204+00
12	REPORT	Logistics	Delayed leaf pickup van	Collection van arrived late twice this week.	Abdul Halim	supervisor	\N	\N	A1	HIGH	RESOLVED	\N	\N	2026-06-14 04:42:20.956204+00	2026-06-14 06:42:20.956204+00	2026-06-16 04:42:20.956204+00
13	COMPLAINT	Welfare	Childcare shed timing request	Request to adjust the childcare shed timing for the morning shift.	Sultana Razia	worker	\N	CG377	A2	LOW	RESOLVED	\N	\N	2026-06-09 04:42:20.956204+00	2026-06-09 08:42:20.956204+00	2026-06-11 04:42:20.956204+00
\.


--
-- Data for Name: finance_ledger; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.finance_ledger (id, txn_type, category, amount, txn_date, description, created_by, entry_date, ref_id, account, status, due_date, note, source_type, source_id, created_at) FROM stdin;
2	\N	REVENUE	620000.00	2026-07-16	\N	\N	2026-02-10	TXN-260201	Bulk Tea Sales	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
3	\N	REVENUE	620000.00	2026-07-16	\N	\N	2026-03-10	TXN-260301	Bulk Tea Sales	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
4	\N	REVENUE	620000.00	2026-07-16	\N	\N	2026-04-10	TXN-260401	Bulk Tea Sales	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
5	\N	REVENUE	620000.00	2026-07-16	\N	\N	2026-05-10	TXN-260501	Bulk Tea Sales	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
6	\N	REVENUE	620000.00	2026-07-16	\N	\N	2026-06-10	TXN-260601	Bulk Tea Sales	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
7	\N	REVENUE	620000.00	2026-07-16	\N	\N	2026-07-10	TXN-260701	Bulk Tea Sales	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
8	\N	PAYROLL	185000.00	2026-07-16	\N	\N	2026-02-27	PAY-260201	Field Wages	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
9	\N	PAYROLL	185000.00	2026-07-16	\N	\N	2026-03-27	PAY-260301	Field Wages	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
10	\N	PAYROLL	185000.00	2026-07-16	\N	\N	2026-04-27	PAY-260401	Field Wages	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
11	\N	PAYROLL	185000.00	2026-07-16	\N	\N	2026-05-27	PAY-260501	Field Wages	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
12	\N	PAYROLL	185000.00	2026-07-16	\N	\N	2026-06-27	PAY-260601	Field Wages	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
13	\N	PAYROLL	185000.00	2026-07-16	\N	\N	2026-07-27	PAY-260701	Field Wages	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
14	\N	EXPENSE	115000.00	2026-07-16	\N	\N	2026-02-13	INV-260201	Fertilizer	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
15	\N	EXPENSE	115000.00	2026-07-16	\N	\N	2026-03-13	INV-260301	Fertilizer	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
16	\N	EXPENSE	115000.00	2026-07-16	\N	\N	2026-04-13	INV-260401	Fertilizer	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
17	\N	EXPENSE	115000.00	2026-07-16	\N	\N	2026-05-13	INV-260501	Fertilizer	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
18	\N	EXPENSE	115000.00	2026-07-16	\N	\N	2026-06-13	INV-260601	Fertilizer	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
19	\N	EXPENSE	115000.00	2026-07-16	\N	\N	2026-07-13	INV-260701	Fertilizer	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
20	\N	EXPENSE	92000.00	2026-07-16	\N	\N	2026-02-16	LOG-260201	Logistics	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
21	\N	EXPENSE	92000.00	2026-07-16	\N	\N	2026-03-16	LOG-260301	Logistics	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
22	\N	EXPENSE	92000.00	2026-07-16	\N	\N	2026-04-16	LOG-260401	Logistics	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
23	\N	EXPENSE	92000.00	2026-07-16	\N	\N	2026-05-16	LOG-260501	Logistics	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
24	\N	EXPENSE	92000.00	2026-07-16	\N	\N	2026-06-16	LOG-260601	Logistics	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
25	\N	EXPENSE	92000.00	2026-07-16	\N	\N	2026-07-16	LOG-260701	Logistics	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
26	\N	EXPENSE	69000.00	2026-07-16	\N	\N	2026-02-19	MNT-260201	Maintenance	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
27	\N	EXPENSE	69000.00	2026-07-16	\N	\N	2026-03-19	MNT-260301	Maintenance	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
28	\N	EXPENSE	69000.00	2026-07-16	\N	\N	2026-04-19	MNT-260401	Maintenance	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
29	\N	EXPENSE	69000.00	2026-07-16	\N	\N	2026-05-19	MNT-260501	Maintenance	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
30	\N	EXPENSE	69000.00	2026-07-16	\N	\N	2026-06-19	MNT-260601	Maintenance	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
31	\N	EXPENSE	69000.00	2026-07-16	\N	\N	2026-07-19	MNT-260701	Maintenance	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
32	\N	REVENUE	12500.00	2026-07-16	\N	\N	2026-07-16	TXN-98671	Outlet Sales	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
33	\N	REVENUE	145000.00	2026-07-16	\N	\N	2026-07-15	TXN-98210	Local Market	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
34	\N	EXPENSE	28400.00	2026-07-16	\N	\N	2026-07-15	UTL-00421	Electricity	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
35	\N	EXPENSE	14200.00	2026-07-16	\N	\N	2026-07-14	MISC-9902	Staff Training	SETTLED	\N	\N	\N	\N	2026-07-16 10:12:36.816261+00
36	\N	EXPENSE	64000.00	2026-07-16	\N	\N	2026-07-14	INV-12908	Chemicals	PENDING	2026-07-20	\N	\N	\N	2026-07-16 10:12:36.816261+00
37	\N	EXPENSE	8200.00	2026-07-16	\N	\N	2026-07-13	MNT-55091	Vehicle Repair	PENDING	2026-07-22	\N	\N	\N	2026-07-16 10:12:36.816261+00
38	\N	LOAN	27000.00	2026-07-16	\N	\N	2026-07-11	LNO-44590	Equip. Finance	PENDING	2026-07-13	\N	\N	\N	2026-07-16 10:12:36.816261+00
\.


--
-- Data for Name: flyway_schema_history; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success) FROM stdin;
1	1	init	SQL	V1__init.sql	1382951328	chaghor	2026-07-14 21:13:56.286906	147	t
2	2	worker job role	SQL	V2__worker_job_role.sql	-658840769	chaghor	2026-07-16 12:45:46.810107	26	t
3	3	user profile and settings	SQL	V3__user_profile_and_settings.sql	736886903	chaghor	2026-07-16 14:28:32.395299	68	t
4	4	finance ledger	SQL	V4__finance_ledger.sql	247669183	chaghor	2026-07-16 16:12:36.804406	310	t
5	5	inventory	SQL	V5__inventory.sql	666902516	chaghor	2026-07-16 18:00:48.215405	68	t
6	6	loans	SQL	V6__loans.sql	1514921927	chaghor	2026-07-17 01:56:46.858362	46	t
7	7	reports	SQL	V7__reports.sql	1260633100	chaghor	2026-07-17 02:39:08.094093	36	t
8	8	field cases	SQL	V8__field_cases.sql	718741185	chaghor	2026-07-17 10:42:20.940377	55	t
9	9	supply chain	SQL	V9__supply_chain.sql	878688476	chaghor	2026-07-17 14:20:01.438774	70	t
10	10	shipment tracking	SQL	V10__shipment_tracking.sql	-1813359300	chaghor	2026-07-17 16:11:56.711856	30	t
11	11	warehouse settings	SQL	V11__warehouse_settings.sql	-652677662	chaghor	2026-07-17 17:03:17.460473	19	t
12	12	ai views	SQL	V12__ai_views.sql	-567081110	chaghor	2026-07-17 19:24:28.402684	21	t
\.


--
-- Data for Name: harvest_schedule; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.harvest_schedule (id, zone_id, sched_date, task, supervisor_id, status) FROM stdin;
\.


--
-- Data for Name: inventory_item; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.inventory_item (id, name, category, unit, quantity, reorder_level, unit_cost, expiry_date, code_label, code_value, capacity, unit_value, site, created_at) FROM stdin;
29	Pruning Shears	TOOLS	pcs	82.00	20.00	\N	\N	Model	Felco 2 Pro	100.00	450.00	Central Hub	2026-07-16 12:00:48.23058+00
30	Urea Fertilizer	CHEMICALS	kg	15.00	25.00	\N	\N	Grade	46-0-0 Grade A	100.00	60.00	Factory	2026-07-16 12:00:48.23058+00
31	NPK 15-15-15	CHEMICALS	kg	77.00	25.00	\N	\N	Sku	FRT-009	100.00	75.00	Central Hub	2026-07-16 12:00:48.23058+00
32	Skiffing Machines	TOOLS	pcs	93.00	10.00	\N	\N	Model	Bahco P16	100.00	8500.00	Remote store	2026-07-16 12:00:48.23058+00
33	Brush Cutters	TOOLS	pcs	81.00	10.00	\N	\N	Model	Stihl FS 120	100.00	12000.00	Central Hub	2026-07-16 12:00:48.23058+00
34	Plucking Baskets	TOOLS	pcs	68.00	30.00	\N	\N	Sku	BSK-220	100.00	180.00	Central Hub	2026-07-16 12:00:48.23058+00
35	Gumboots	TOOLS	pairs	45.00	20.00	\N	\N	Sku	GB-45	100.00	320.00	Factory	2026-07-16 12:00:48.23058+00
36	Glyphosate	CHEMICALS	L	22.00	20.00	\N	\N	Grade	41% SL	100.00	540.00	Central Hub	2026-07-16 12:00:48.23058+00
37	Tea Roller Machine	MACHINERY	units	88.00	5.00	\N	\N	Model	TR-450	100.00	145000.00	Factory	2026-07-16 12:00:48.23058+00
38	Knapsack Sprayer	MACHINERY	pcs	35.00	15.00	\N	\N	Model	KS-16	100.00	2600.00	Central Hub	2026-07-16 12:00:48.23058+00
39	Water Pump	MACHINERY	pcs	12.00	10.00	\N	\N	Model	WP-3HP	100.00	18500.00	Remote store	2026-07-16 12:00:48.23058+00
40	Diesel Fuel	CHEMICALS	L	58.00	30.00	\N	\N	Sku	FUEL-DSL	100.00	110.00	Central Hub	2026-07-16 12:00:48.23058+00
41	Copper Fungicide	CHEMICALS	kg	9.00	20.00	\N	\N	Grade	50% WP	100.00	680.00	Factory	2026-07-16 12:00:48.23058+00
42	Secateurs	TOOLS	pcs	74.00	20.00	\N	\N	Model	ARS VS-8R	100.00	890.00	Central Hub	2026-07-16 12:00:48.23058+00
\.


--
-- Data for Name: knowledge_base; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.knowledge_base (id, title, source_type, raw_text, uploaded_by, created_at) FROM stdin;
\.


--
-- Data for Name: leaf_collection; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.leaf_collection (id, worker_id, zone_id, collect_date, weight_kg, quality_grade, photo_id, recorded_by, created_at) FROM stdin;
\.


--
-- Data for Name: loan; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.loan (id, reference, worker_name, zone, avatar_url, principal, reason, repaid, daily_deduction, status, requested_at, decided_at, decided_by) FROM stdin;
1	\N	Zawad	A1	\N	3000.00	Medical Emergency (Hospitalization)	0.00	15.00	PENDING	2026-07-16 19:46:46.871631+00	\N	\N
2	\N	Adil	A4	\N	2000.00	School Supplies (Secondary Level)	0.00	10.00	PENDING	2026-07-16 18:56:46.871631+00	\N	\N
3	\N	Rafiq	B1	\N	1500.00	Home repair after storm damage	0.00	10.00	PENDING	2026-07-16 16:56:46.871631+00	\N	\N
4	\N	Shuvo	C2	\N	5000.00	Wedding expenses	0.00	20.00	PENDING	2026-07-16 13:56:46.871631+00	\N	\N
5	\N	Nabila	A2	\N	2500.00	Medical checkup for child	0.00	12.00	PENDING	2026-07-15 19:56:46.871631+00	\N	\N
6	\N	Karim	B3	\N	1800.00	Bicycle for commute	0.00	10.00	PENDING	2026-07-14 19:56:46.871631+00	\N	\N
7	L-2026-101	Mukarram	A3	\N	4000.00	\N	2000.00	10.00	ACTIVE	2026-06-06 19:56:46.871631+00	2026-06-16 19:56:46.871631+00	\N
8	L-2026-102	Sabbir	A3	\N	6000.00	\N	3200.00	10.00	ACTIVE	2026-06-11 19:56:46.871631+00	2026-06-18 19:56:46.871631+00	\N
9	L-2026-103	Tania	B2	\N	12000.00	\N	500.00	10.00	ACTIVE	2026-06-26 19:56:46.871631+00	2026-07-01 19:56:46.871631+00	\N
10	L-2026-104	Jamil	C1	\N	3000.00	\N	2400.00	15.00	ACTIVE	2026-06-21 19:56:46.871631+00	2026-06-26 19:56:46.871631+00	\N
11	L-2026-105	Farhana	A1	\N	8000.00	\N	6000.00	20.00	ACTIVE	2026-05-27 19:56:46.871631+00	2026-06-01 19:56:46.871631+00	\N
12	L-2026-106	Imran	B1	\N	5000.00	\N	1500.00	12.00	ACTIVE	2026-06-28 19:56:46.871631+00	2026-07-04 19:56:46.871631+00	\N
13	L-2026-091	Bappi	C3	\N	7000.00	\N	800.00	10.00	OVERDUE	2026-05-07 19:56:46.871631+00	2026-05-17 19:56:46.871631+00	\N
14	L-2026-092	Lipi	A4	\N	4500.00	\N	1200.00	10.00	OVERDUE	2026-05-12 19:56:46.871631+00	2026-05-22 19:56:46.871631+00	\N
15	L-2026-071	Hasan	A2	\N	3000.00	\N	3000.00	10.00	REPAID	2026-03-18 19:56:46.871631+00	2026-03-28 19:56:46.871631+00	\N
16	L-2026-072	Momin	B2	\N	5000.00	\N	5000.00	15.00	REPAID	2026-03-08 19:56:46.871631+00	2026-03-18 19:56:46.871631+00	\N
17	L-2026-073	Ruma	C1	\N	2000.00	\N	2000.00	10.00	REPAID	2026-04-07 19:56:46.871631+00	2026-04-12 19:56:46.871631+00	\N
18	L-2026-074	Selim	A3	\N	4000.00	\N	4000.00	10.00	REPAID	2026-02-26 19:56:46.871631+00	2026-03-03 19:56:46.871631+00	\N
\.


--
-- Data for Name: loan_ai_assessment; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.loan_ai_assessment (id, loan_id, risk_level, suggested_amount, reason_en, reason_bn, model, features_json, created_at) FROM stdin;
\.


--
-- Data for Name: loan_repayment; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.loan_repayment (id, loan_id, payroll_id, amount, repaid_on) FROM stdin;
\.


--
-- Data for Name: loans; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.loans (id, worker_id, principal, reason, status, interest_rate, installment_amount, tenure_months, approved_by, applied_at, disbursed_at) FROM stdin;
\.


--
-- Data for Name: payroll; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.payroll (id, worker_id, period_start, period_end, present_days, base_amount, surplus_amount, grade_bonus, gross_amount, loan_deduction, advance_recovery, other_deduction, net_payable, status, approved_by, paid_at, created_at) FROM stdin;
\.


--
-- Data for Name: payroll_config; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.payroll_config (id, base_daily_wage, leaf_quota_kg, surplus_rate, grade_bonus_rate, effective_from, updated_by) FROM stdin;
\.


--
-- Data for Name: report; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.report (id, report_type, period, content, is_ai_generated, created_by, status, created_at) FROM stdin;
\.


--
-- Data for Name: requisition; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.requisition (id, item_id, requested_by, quantity, status, approved_by, created_at, item_label, requester, detail, requested_at, decided_at, decided_by) FROM stdin;
2	\N	\N	\N	PENDING	\N	2026-07-16 12:00:48.23058+00	Gloves (20 Pairs)	S. Kumar	Section 7 • Plucking Team	2026-07-16 11:50:48.23058+00	\N	\N
3	\N	\N	\N	PENDING	\N	2026-07-16 12:00:48.23058+00	Fuel (40L Diesel)	M. Jinnah	Logistics • Tractor M-2	2026-07-16 11:36:48.23058+00	\N	\N
4	\N	\N	\N	PENDING	\N	2026-07-16 12:00:48.23058+00	Pruning Shears (5 Units)	R. Das	Section 3 • Pruning Crew	2026-07-16 10:00:48.23058+00	\N	\N
5	\N	\N	\N	PENDING	\N	2026-07-16 12:00:48.23058+00	Urea Fertilizer (50 kg)	A. Roy	Factory • Nursery	2026-07-16 07:00:48.23058+00	\N	\N
6	\N	\N	\N	APPROVED	\N	2026-07-16 12:00:48.23058+00	Sprayer Nozzles (10)	B. Ghosh	Section 2 • Spraying	2026-07-16 06:00:48.23058+00	2026-07-16 11:00:48.23058+00	\N
7	\N	\N	\N	APPROVED	\N	2026-07-16 12:00:48.23058+00	Tea Sacks (100)	N. Islam	Factory • Packing	2026-07-16 04:00:48.23058+00	2026-07-16 10:00:48.23058+00	\N
8	\N	\N	\N	APPROVED	\N	2026-07-16 12:00:48.23058+00	Diesel (20L)	P. Barua	Logistics • Generator	2026-07-16 05:00:48.23058+00	2026-07-16 10:30:48.23058+00	\N
\.


--
-- Data for Name: sales_transaction; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.sales_transaction (id, trx_id, txn_date, grade, batch_code, buyer, volume_kg, rate_per_kg, net_revenue, pay_status, ship_status, created_at) FROM stdin;
1	TX-90812	2026-07-03	BOP	TC-1022	Dhaka Tea Traders	1200.00	450.00	540000.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
2	TX-11873	2026-06-17	CTC-DUST	TC-1025	Dhaka Tea Traders	760.00	450.00	342000.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
3	TX-40812	2026-05-24	BOP	TC-1022	Global Cha Co.	1200.00	450.00	540000.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
4	TX-42492	2026-05-21	BOP	TC-1022	Dhaka Tea Traders	757.00	450.00	340650.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
5	TX-90248	2026-04-24	BOP	TC-1031	Srimangol Auction	313.00	450.00	140850.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
6	TX-90711	2026-07-10	CTC	TC-1025	Chattogram Exporters	2000.00	460.00	920000.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
7	TX-90715	2026-07-12	DUST	TC-1029	Global Cha Co.	900.00	300.00	270000.00	PENDING	IN_TRANSIT	2026-07-17 08:20:01.452832+00
8	TX-90720	2026-07-14	BOP	TC-1031	Dhaka Tea Traders	1500.00	455.00	682500.00	PENDING	PENDING	2026-07-17 08:20:01.452832+00
9	TX-90722	2026-07-15	CTC	TC-1027	Sylhet Wholesale	1100.00	440.00	484000.00	PAID	IN_TRANSIT	2026-07-17 08:20:01.452832+00
10	TX-90724	2026-07-16	BOP	TC-1022	Global Cha Co.	500.00	450.00	225000.00	PENDING	PENDING	2026-07-17 08:20:01.452832+00
11	TX-88010	2026-03-02	BOP	TC-1031	Srimangol Auction	2200.00	445.00	979000.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
12	TX-88044	2026-02-19	CTC-DUST	TC-1025	Chattogram Exporters	1750.00	430.00	752500.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
13	TX-87901	2026-01-28	DUST	TC-1029	Global Cha Co.	1300.00	300.00	390000.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
14	TX-87720	2025-12-15	BOP	TC-1022	Dhaka Tea Traders	1600.00	450.00	720000.00	PAID	DELIVERED	2026-07-17 08:20:01.452832+00
\.


--
-- Data for Name: saved_report; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.saved_report (id, title, report_type, period_start, period_end, status, summary, revenue, expense, net_profit, generated_by, generated_at, finalized_at) FROM stdin;
1	Monthly Report - April 2026	MONTHLY	2026-04-01	2026-04-30	FINALIZED	For April 2026, the estate recorded revenue of BDT 620000 against expenses of BDT 461000, for a net profit of BDT 159000 (margin 25.6%). Payroll cost was BDT 185000. Rolled up from the finance ledger.	620000.00	461000.00	159000.00	\N	2026-05-02 18:00:00+00	2026-05-03 18:00:00+00
2	Monthly Report - May 2026	MONTHLY	2026-05-01	2026-05-31	FINALIZED	For May 2026, the estate recorded revenue of BDT 620000 against expenses of BDT 461000, for a net profit of BDT 159000 (margin 25.6%). Payroll cost was BDT 185000. Rolled up from the finance ledger.	620000.00	461000.00	159000.00	\N	2026-06-02 18:00:00+00	2026-06-03 18:00:00+00
3	Monthly Report - June 2026	MONTHLY	2026-06-01	2026-06-30	FINALIZED	For June 2026, the estate recorded revenue of BDT 620000 against expenses of BDT 461000, for a net profit of BDT 159000 (margin 25.6%). Payroll cost was BDT 185000. Rolled up from the finance ledger.	620000.00	461000.00	159000.00	\N	2026-07-02 18:00:00+00	2026-07-03 18:00:00+00
4	Monthly Report - June 2026	MONTHLY	2026-06-30	2026-07-30	DRAFT	For June 2026, the estate recorded revenue of BDT 777500 against expenses of BDT 575800, for a net profit of BDT 201700 (margin 25.9%). Payroll cost was BDT 185000. Attendance averaged 0.0% across 5 active workers. Loans outstanding stand at BDT 31900 with BDT 31600 recovered to date.	777500.00	575800.00	201700.00	1	2026-07-16 20:39:22.978934+00	\N
5	Monthly Report - June 2026	MONTHLY	2026-06-30	2026-07-30	DRAFT	For June 2026, the estate recorded revenue of BDT 777500 against expenses of BDT 575800, for a net profit of BDT 201700 (margin 25.9%). Payroll cost was BDT 185000. Attendance averaged 0.0% across 5 active workers. Loans outstanding stand at BDT 31900 with BDT 31600 recovered to date.	777500.00	575800.00	201700.00	1	2026-07-16 20:39:30.511828+00	\N
6	Monthly Report - June 2026	MONTHLY	2026-06-30	2026-07-30	DRAFT	For June 2026, the estate recorded revenue of BDT 777500 against expenses of BDT 575800, for a net profit of BDT 201700 (margin 25.9%). Payroll cost was BDT 185000. Attendance averaged 0.0% across 5 active workers. Loans outstanding stand at BDT 31900 with BDT 31600 recovered to date.	777500.00	575800.00	201700.00	1	2026-07-16 20:39:31.761703+00	\N
11	Monthly Report - June 2026	MONTHLY	2026-06-30	2026-07-30	DRAFT	For June 2026, the estate recorded revenue of BDT 777500 against expenses of BDT 575800, for a net profit of BDT 201700 (margin 25.9%). Payroll cost was BDT 185000. Attendance averaged 0.0% across 5 active workers. Loans outstanding stand at BDT 31900 with BDT 31600 recovered to date.	777500.00	575800.00	201700.00	1	2026-07-17 15:52:19.100087+00	\N
\.


--
-- Data for Name: shipment; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.shipment (id, code, vehicle, origin, destination, weight_kg, status, on_time, eta_text, speed_kmh, created_at, track_token, current_lat, current_lng, heading_deg, last_ping_at) FROM stdin;
4	TK-8831	TR-402	Habiganj	Dhaka	800.00	IN_TRANSIT	t	4h 10m rem.	0	2026-07-17 07:50:01.452832+00	bb742434a1d84de5b89178533711ac78	23.697410	90.433277	\N	2026-07-17 15:32:32.03486+00
6	TK-6610	TR-090	Srimangal	Dhaka	5000.00	DELIVERED	t	Delivered	0	2026-07-15 08:20:01.452832+00	d62c12ddacc54b5a94961ecfd6bd1ab9	\N	\N	\N	\N
7	TK-6511	TR-077	Sylhet	Chattogram	4100.00	DELIVERED	t	Delivered	0	2026-07-14 08:20:01.452832+00	72ffb7808cd04bff8847d40799498fd8	\N	\N	\N	\N
8	TK-6402	TR-065	Habiganj	Dhaka	3000.00	DELIVERED	t	Delivered	0	2026-07-13 08:20:01.452832+00	32afd119b1364c8d95aec6e6ab1c798d	\N	\N	\N	\N
3	TK-4412	TR-334	Srimangal	Chattogram	2500.00	AT_WEIGH_IN	f	+1h 20m	28	2026-07-17 05:20:01.452832+00	8980470b1ddd4bbaa695269a851dca87	\N	\N	\N	\N
5	TK-7725	TR-118	Moulvibazar	Sylhet	600.00	DELIVERED	t	0h 40m rem.	0	2026-07-17 06:50:01.452832+00	cd3c26cae1ee4b379356a57db6356eb6	23.697665	90.433268	\N	2026-07-17 11:57:02.308848+00
2	TK-9921	TR-210	Sylhet	Dhaka	1200.00	IN_TRANSIT	t	2h 45m rem.	40	2026-07-17 06:20:01.452832+00	113d40719ee64d609bcf5a333c2a1594	23.697552	90.433334	\N	2026-07-17 12:07:17.533724+00
\.


--
-- Data for Name: sms_log; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.sms_log (id, worker_id, phone, message, category, status, provider, sent_at) FROM stdin;
\.


--
-- Data for Name: supervisor_zone; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.supervisor_zone (id, supervisor_id, zone_id, assigned_at) FROM stdin;
\.


--
-- Data for Name: supply_chain_shipment; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.supply_chain_shipment (id, batch_code, stage, quantity_kg, from_loc, to_loc, status, ship_date, created_by) FROM stdin;
\.


--
-- Data for Name: tea_batch; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.tea_batch (id, batch_code, grade, quality_pct, quality_note, stage, weight_kg, readiness, created_at) FROM stdin;
1	TC-1022	BOP	98.00	Premium	READY_FOR_DISPATCH	850.00	PASSED	2026-07-17 03:20:01.452832+00
2	TC-1025	CTC	94.00	Standard	READY_FOR_DISPATCH	1400.00	PASSED	2026-07-17 02:20:01.452832+00
3	TC-1031	BOP	96.00	Premium	READY_FOR_DISPATCH	10200.00	PASSED	2026-07-17 00:20:01.452832+00
4	TC-1027	CTC	90.00	Sorting	PROCESSING	4200.00	PENDING	2026-07-17 05:20:01.452832+00
5	TC-1029	DUST	\N	Pending Lab Report	RAW_LEAF	1770.00	PENDING	2026-07-17 07:20:01.452832+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.users (id, username, email, password_hash, role, locale, is_active, created_at, display_name, phone, avatar_url, notify_broadcast, notify_attendance, notify_payroll) FROM stdin;
2	supervisor	supervisor@chaghor.local	$2a$10$CGLKonItUOAJ9QG0oVue2uMBv81N1jQUQCYDztVJnIegGCnr73hOq	supervisor	en	t	2026-07-15 13:35:54.648265+00	\N	\N	\N	t	t	t
3	worker	worker@chaghor.local	$2a$10$4WEIoCCVd/tIAJztBbfbcuBeJFs02RJUA2DDhkzsn15LrWw8RF0Hu	worker	en	t	2026-07-15 13:35:54.745702+00	\N	\N	\N	t	t	t
1	admin	admin@chaghor.local	$2a$10$QZK3BsuG5ax267.BBugMde6jZDsPgBZFvGdfnfTXf6hl2vsgvYC2a	admin	en	t	2026-07-15 13:35:54.527137+00	Faiyaj	\N	data:image/jpeg;base64,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	t	t	t
\.


--
-- Data for Name: vision_inference; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.vision_inference (id, subject_type, subject_ref, image_url, label, confidence, model, created_at) FROM stdin;
\.


--
-- Data for Name: warehouse; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.warehouse (id, name, lat, lng, updated_at) FROM stdin;
1	Chaghor Central Warehouse - Srimangal	24.306500	91.729600	2026-07-17 11:03:17.470393+00
\.


--
-- Data for Name: weather_log; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.weather_log (id, zone_id, log_date, temp_c, humidity, rainfall_mm, condition, source, forecast_json) FROM stdin;
\.


--
-- Data for Name: withdrawal_request; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.withdrawal_request (id, worker_id, amount, method, status, requested_at, processed_at) FROM stdin;
\.


--
-- Data for Name: workers; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.workers (id, user_id, full_name, name_bn, phone, national_id, dob, zone_id, supervisor_id, join_date, daily_wage, status, photo_url, created_at, job_role) FROM stdin;
1	\N	Abdul Karim	আব্দুল করিম	+8801710000001	\N	\N	1	2	2026-05-16	175.00	active	\N	2026-07-16 06:45:48.564378+00	plucker
2	\N	Rahima Begum	রহিমা বেগম	+8801710000002	\N	\N	2	2	2026-04-16	170.00	active	\N	2026-07-16 06:45:48.570134+00	plucker
3	\N	Jamal Uddin	জামাল উদ্দিন	+8801710000003	\N	\N	3	2	2026-03-16	185.00	active	\N	2026-07-16 06:45:48.571163+00	sprayer
4	\N	Fatema Khatun	ফাতেমা খাতুন	+8801710000004	\N	\N	4	2	2026-02-16	190.00	active	\N	2026-07-16 06:45:48.572489+00	maintenance
5	\N	Nurul Islam	নুরুল ইসলাম	+8801710000005	\N	\N	1	2	2026-01-16	180.00	active	\N	2026-07-16 06:45:48.573931+00	factory
\.


--
-- Data for Name: zones; Type: TABLE DATA; Schema: public; Owner: chaghor
--

COPY public.zones (id, name, code, area_hectare, polygon_geojson, target_kg_per_day) FROM stdin;
1	Zone A-1	A1	12.50	\N	480.00
2	Zone B-1	B1	10.00	\N	400.00
3	Zone B-2	B2	8.50	\N	350.00
4	Zone C-1	C1	15.00	\N	520.00
\.


--
-- Name: ai_prediction_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.ai_prediction_id_seq', 1, false);


--
-- Name: ai_query_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.ai_query_log_id_seq', 1, false);


--
-- Name: attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.attendance_id_seq', 1, false);


--
-- Name: broadcast_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.broadcast_id_seq', 1, false);


--
-- Name: case_reply_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.case_reply_id_seq', 1, true);


--
-- Name: chemical_application_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.chemical_application_id_seq', 1, false);


--
-- Name: complaint_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.complaint_id_seq', 1, false);


--
-- Name: compliance_record_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.compliance_record_id_seq', 1, false);


--
-- Name: document_embedding_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.document_embedding_id_seq', 1, false);


--
-- Name: field_case_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.field_case_id_seq', 13, true);


--
-- Name: finance_ledger_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.finance_ledger_id_seq', 38, true);


--
-- Name: harvest_schedule_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.harvest_schedule_id_seq', 1, false);


--
-- Name: inventory_item_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.inventory_item_id_seq', 42, true);


--
-- Name: knowledge_base_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.knowledge_base_id_seq', 1, false);


--
-- Name: leaf_collection_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.leaf_collection_id_seq', 1, false);


--
-- Name: loan_ai_assessment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.loan_ai_assessment_id_seq', 1, false);


--
-- Name: loan_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.loan_id_seq', 18, true);


--
-- Name: loan_repayment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.loan_repayment_id_seq', 1, false);


--
-- Name: loans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.loans_id_seq', 1, false);


--
-- Name: payroll_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.payroll_config_id_seq', 1, false);


--
-- Name: payroll_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.payroll_id_seq', 1, false);


--
-- Name: report_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.report_id_seq', 1, false);


--
-- Name: requisition_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.requisition_id_seq', 8, true);


--
-- Name: sales_transaction_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.sales_transaction_id_seq', 14, true);


--
-- Name: saved_report_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.saved_report_id_seq', 11, true);


--
-- Name: shipment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.shipment_id_seq', 8, true);


--
-- Name: sms_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.sms_log_id_seq', 1, false);


--
-- Name: supervisor_zone_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.supervisor_zone_id_seq', 1, false);


--
-- Name: supply_chain_shipment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.supply_chain_shipment_id_seq', 1, false);


--
-- Name: tea_batch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.tea_batch_id_seq', 5, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: vision_inference_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.vision_inference_id_seq', 1, false);


--
-- Name: weather_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.weather_log_id_seq', 1, false);


--
-- Name: withdrawal_request_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.withdrawal_request_id_seq', 1, false);


--
-- Name: workers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.workers_id_seq', 5, true);


--
-- Name: zones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: chaghor
--

SELECT pg_catalog.setval('public.zones_id_seq', 4, true);


--
-- Name: ai_prediction ai_prediction_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.ai_prediction
    ADD CONSTRAINT ai_prediction_pkey PRIMARY KEY (id);


--
-- Name: ai_query_log ai_query_log_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.ai_query_log
    ADD CONSTRAINT ai_query_log_pkey PRIMARY KEY (id);


--
-- Name: app_setting app_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.app_setting
    ADD CONSTRAINT app_setting_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_worker_id_work_date_key; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_worker_id_work_date_key UNIQUE (worker_id, work_date);


--
-- Name: broadcast broadcast_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.broadcast
    ADD CONSTRAINT broadcast_pkey PRIMARY KEY (id);


--
-- Name: case_reply case_reply_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.case_reply
    ADD CONSTRAINT case_reply_pkey PRIMARY KEY (id);


--
-- Name: chemical_application chemical_application_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.chemical_application
    ADD CONSTRAINT chemical_application_pkey PRIMARY KEY (id);


--
-- Name: complaint complaint_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.complaint
    ADD CONSTRAINT complaint_pkey PRIMARY KEY (id);


--
-- Name: compliance_record compliance_record_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.compliance_record
    ADD CONSTRAINT compliance_record_pkey PRIMARY KEY (id);


--
-- Name: document_embedding document_embedding_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.document_embedding
    ADD CONSTRAINT document_embedding_pkey PRIMARY KEY (id);


--
-- Name: field_case field_case_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.field_case
    ADD CONSTRAINT field_case_pkey PRIMARY KEY (id);


--
-- Name: finance_ledger finance_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.finance_ledger
    ADD CONSTRAINT finance_ledger_pkey PRIMARY KEY (id);


--
-- Name: flyway_schema_history flyway_schema_history_pk; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.flyway_schema_history
    ADD CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank);


--
-- Name: harvest_schedule harvest_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.harvest_schedule
    ADD CONSTRAINT harvest_schedule_pkey PRIMARY KEY (id);


--
-- Name: inventory_item inventory_item_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.inventory_item
    ADD CONSTRAINT inventory_item_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base knowledge_base_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.knowledge_base
    ADD CONSTRAINT knowledge_base_pkey PRIMARY KEY (id);


--
-- Name: leaf_collection leaf_collection_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.leaf_collection
    ADD CONSTRAINT leaf_collection_pkey PRIMARY KEY (id);


--
-- Name: loan_ai_assessment loan_ai_assessment_loan_id_key; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan_ai_assessment
    ADD CONSTRAINT loan_ai_assessment_loan_id_key UNIQUE (loan_id);


--
-- Name: loan_ai_assessment loan_ai_assessment_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan_ai_assessment
    ADD CONSTRAINT loan_ai_assessment_pkey PRIMARY KEY (id);


--
-- Name: loan loan_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan
    ADD CONSTRAINT loan_pkey PRIMARY KEY (id);


--
-- Name: loan_repayment loan_repayment_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan_repayment
    ADD CONSTRAINT loan_repayment_pkey PRIMARY KEY (id);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- Name: payroll_config payroll_config_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.payroll_config
    ADD CONSTRAINT payroll_config_pkey PRIMARY KEY (id);


--
-- Name: payroll payroll_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT payroll_pkey PRIMARY KEY (id);


--
-- Name: payroll payroll_worker_id_period_start_period_end_key; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT payroll_worker_id_period_start_period_end_key UNIQUE (worker_id, period_start, period_end);


--
-- Name: report report_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT report_pkey PRIMARY KEY (id);


--
-- Name: requisition requisition_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.requisition
    ADD CONSTRAINT requisition_pkey PRIMARY KEY (id);


--
-- Name: sales_transaction sales_transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.sales_transaction
    ADD CONSTRAINT sales_transaction_pkey PRIMARY KEY (id);


--
-- Name: saved_report saved_report_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.saved_report
    ADD CONSTRAINT saved_report_pkey PRIMARY KEY (id);


--
-- Name: shipment shipment_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.shipment
    ADD CONSTRAINT shipment_pkey PRIMARY KEY (id);


--
-- Name: sms_log sms_log_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.sms_log
    ADD CONSTRAINT sms_log_pkey PRIMARY KEY (id);


--
-- Name: supervisor_zone supervisor_zone_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.supervisor_zone
    ADD CONSTRAINT supervisor_zone_pkey PRIMARY KEY (id);


--
-- Name: supervisor_zone supervisor_zone_supervisor_id_zone_id_key; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.supervisor_zone
    ADD CONSTRAINT supervisor_zone_supervisor_id_zone_id_key UNIQUE (supervisor_id, zone_id);


--
-- Name: supply_chain_shipment supply_chain_shipment_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.supply_chain_shipment
    ADD CONSTRAINT supply_chain_shipment_pkey PRIMARY KEY (id);


--
-- Name: tea_batch tea_batch_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.tea_batch
    ADD CONSTRAINT tea_batch_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: vision_inference vision_inference_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.vision_inference
    ADD CONSTRAINT vision_inference_pkey PRIMARY KEY (id);


--
-- Name: warehouse warehouse_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.warehouse
    ADD CONSTRAINT warehouse_pkey PRIMARY KEY (id);


--
-- Name: weather_log weather_log_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.weather_log
    ADD CONSTRAINT weather_log_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_request withdrawal_request_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.withdrawal_request
    ADD CONSTRAINT withdrawal_request_pkey PRIMARY KEY (id);


--
-- Name: workers workers_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_pkey PRIMARY KEY (id);


--
-- Name: zones zones_code_key; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_code_key UNIQUE (code);


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_pkey PRIMARY KEY (id);


--
-- Name: flyway_schema_history_s_idx; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX flyway_schema_history_s_idx ON public.flyway_schema_history USING btree (success);


--
-- Name: idx_aiquery_user; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_aiquery_user ON public.ai_query_log USING btree (user_id);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_attendance_date ON public.attendance USING btree (work_date);


--
-- Name: idx_attendance_worker; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_attendance_worker ON public.attendance USING btree (worker_id);


--
-- Name: idx_case_reply_case; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_case_reply_case ON public.case_reply USING btree (case_id, created_at);


--
-- Name: idx_chem_zone; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_chem_zone ON public.chemical_application USING btree (zone_id);


--
-- Name: idx_complaint_status; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_complaint_status ON public.complaint USING btree (status);


--
-- Name: idx_docemb_document; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_docemb_document ON public.document_embedding USING btree (document_id);


--
-- Name: idx_docemb_embedding; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_docemb_embedding ON public.document_embedding USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_field_case_created_at; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_field_case_created_at ON public.field_case USING btree (created_at DESC);


--
-- Name: idx_field_case_status; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_field_case_status ON public.field_case USING btree (status);


--
-- Name: idx_field_case_type; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_field_case_type ON public.field_case USING btree (case_type);


--
-- Name: idx_finance_category; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_finance_category ON public.finance_ledger USING btree (category);


--
-- Name: idx_finance_entry_date; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_finance_entry_date ON public.finance_ledger USING btree (entry_date);


--
-- Name: idx_finance_status; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_finance_status ON public.finance_ledger USING btree (status);


--
-- Name: idx_inventory_category; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_inventory_category ON public.inventory_item USING btree (category);


--
-- Name: idx_inventory_site; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_inventory_site ON public.inventory_item USING btree (site);


--
-- Name: idx_leaf_date; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_leaf_date ON public.leaf_collection USING btree (collect_date);


--
-- Name: idx_leaf_worker; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_leaf_worker ON public.leaf_collection USING btree (worker_id);


--
-- Name: idx_loan_status; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_loan_status ON public.loan USING btree (status);


--
-- Name: idx_loans_status; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_loans_status ON public.loans USING btree (status);


--
-- Name: idx_loans_worker; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_loans_worker ON public.loans USING btree (worker_id);


--
-- Name: idx_payroll_status; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_payroll_status ON public.payroll USING btree (status);


--
-- Name: idx_payroll_worker; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_payroll_worker ON public.payroll USING btree (worker_id);


--
-- Name: idx_repay_loan; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_repay_loan ON public.loan_repayment USING btree (loan_id);


--
-- Name: idx_requisition_item; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_requisition_item ON public.requisition USING btree (item_id);


--
-- Name: idx_requisition_status; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_requisition_status ON public.requisition USING btree (status);


--
-- Name: idx_sales_txn_date; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_sales_txn_date ON public.sales_transaction USING btree (txn_date DESC, id DESC);


--
-- Name: idx_saved_report_generated_at; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_saved_report_generated_at ON public.saved_report USING btree (generated_at);


--
-- Name: idx_shipment_created_at; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_shipment_created_at ON public.shipment USING btree (created_at DESC);


--
-- Name: idx_shipment_status; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_shipment_status ON public.shipment USING btree (status);


--
-- Name: idx_tea_batch_created_at; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_tea_batch_created_at ON public.tea_batch USING btree (created_at DESC);


--
-- Name: idx_tea_batch_stage; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_tea_batch_stage ON public.tea_batch USING btree (stage);


--
-- Name: idx_weather_zone_date; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_weather_zone_date ON public.weather_log USING btree (zone_id, log_date);


--
-- Name: idx_workers_supervisor; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_workers_supervisor ON public.workers USING btree (supervisor_id);


--
-- Name: idx_workers_zone; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE INDEX idx_workers_zone ON public.workers USING btree (zone_id);


--
-- Name: ux_shipment_track_token; Type: INDEX; Schema: public; Owner: chaghor
--

CREATE UNIQUE INDEX ux_shipment_track_token ON public.shipment USING btree (track_token);


--
-- Name: ai_prediction ai_prediction_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.ai_prediction
    ADD CONSTRAINT ai_prediction_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;


--
-- Name: ai_query_log ai_query_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.ai_query_log
    ADD CONSTRAINT ai_query_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;


--
-- Name: broadcast broadcast_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.broadcast
    ADD CONSTRAINT broadcast_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chemical_application chemical_application_applied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.chemical_application
    ADD CONSTRAINT chemical_application_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chemical_application chemical_application_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.chemical_application
    ADD CONSTRAINT chemical_application_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_item(id) ON DELETE SET NULL;


--
-- Name: chemical_application chemical_application_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.chemical_application
    ADD CONSTRAINT chemical_application_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;


--
-- Name: complaint complaint_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.complaint
    ADD CONSTRAINT complaint_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: complaint complaint_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.complaint
    ADD CONSTRAINT complaint_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;


--
-- Name: compliance_record compliance_record_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.compliance_record
    ADD CONSTRAINT compliance_record_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_embedding document_embedding_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.document_embedding
    ADD CONSTRAINT document_embedding_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_base(id) ON DELETE CASCADE;


--
-- Name: finance_ledger finance_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.finance_ledger
    ADD CONSTRAINT finance_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: harvest_schedule harvest_schedule_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.harvest_schedule
    ADD CONSTRAINT harvest_schedule_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: harvest_schedule harvest_schedule_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.harvest_schedule
    ADD CONSTRAINT harvest_schedule_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;


--
-- Name: knowledge_base knowledge_base_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.knowledge_base
    ADD CONSTRAINT knowledge_base_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leaf_collection leaf_collection_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.leaf_collection
    ADD CONSTRAINT leaf_collection_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.vision_inference(id) ON DELETE SET NULL;


--
-- Name: leaf_collection leaf_collection_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.leaf_collection
    ADD CONSTRAINT leaf_collection_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leaf_collection leaf_collection_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.leaf_collection
    ADD CONSTRAINT leaf_collection_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: leaf_collection leaf_collection_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.leaf_collection
    ADD CONSTRAINT leaf_collection_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;


--
-- Name: loan_ai_assessment loan_ai_assessment_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan_ai_assessment
    ADD CONSTRAINT loan_ai_assessment_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: loan_repayment loan_repayment_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan_repayment
    ADD CONSTRAINT loan_repayment_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: loan_repayment loan_repayment_payroll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loan_repayment
    ADD CONSTRAINT loan_repayment_payroll_id_fkey FOREIGN KEY (payroll_id) REFERENCES public.payroll(id) ON DELETE SET NULL;


--
-- Name: loans loans_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: loans loans_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: payroll payroll_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT payroll_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payroll_config payroll_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.payroll_config
    ADD CONSTRAINT payroll_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payroll payroll_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT payroll_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: report report_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.report
    ADD CONSTRAINT report_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: requisition requisition_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.requisition
    ADD CONSTRAINT requisition_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: requisition requisition_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.requisition
    ADD CONSTRAINT requisition_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_item(id) ON DELETE CASCADE;


--
-- Name: requisition requisition_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.requisition
    ADD CONSTRAINT requisition_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sms_log sms_log_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.sms_log
    ADD CONSTRAINT sms_log_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;


--
-- Name: supervisor_zone supervisor_zone_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.supervisor_zone
    ADD CONSTRAINT supervisor_zone_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: supervisor_zone supervisor_zone_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.supervisor_zone
    ADD CONSTRAINT supervisor_zone_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;


--
-- Name: supply_chain_shipment supply_chain_shipment_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.supply_chain_shipment
    ADD CONSTRAINT supply_chain_shipment_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: weather_log weather_log_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.weather_log
    ADD CONSTRAINT weather_log_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;


--
-- Name: withdrawal_request withdrawal_request_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.withdrawal_request
    ADD CONSTRAINT withdrawal_request_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: workers workers_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workers workers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workers workers_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: chaghor
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO chabot_readonly;


--
-- Name: TABLE view_attendance; Type: ACL; Schema: public; Owner: chaghor
--

GRANT SELECT ON TABLE public.view_attendance TO chabot_readonly;


--
-- Name: TABLE view_worker; Type: ACL; Schema: public; Owner: chaghor
--

GRANT SELECT ON TABLE public.view_worker TO chabot_readonly;


--
-- PostgreSQL database dump complete
--

\unrestrict 4uosefYeBwGbuh9o58GJ2XBBuDCaLmekyLeegyyAHJZcWLZuchlENigDhQ7euaW

