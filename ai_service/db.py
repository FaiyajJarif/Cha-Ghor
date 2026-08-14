"""
Read-only database access for the Cha Bot AI service.

Defense in depth:
  1. Connects as a dedicated read-only role (chabot_readonly) that can only
     SELECT the two curated views.
  2. Forces a READ ONLY transaction + statement timeout on every query.
  3. A SQL guard rejects anything that is not a single SELECT over the
     whitelisted views.
"""
import os
import re

import psycopg2
import psycopg2.extras

AI_DB_HOST = os.getenv("AI_DB_HOST", "localhost")
AI_DB_PORT = os.getenv("AI_DB_PORT", "5433")
AI_DB_NAME = os.getenv("AI_DB_NAME", "chaghor")
AI_DB_USER = os.getenv("AI_DB_USER", "chabot_readonly")
AI_DB_PASSWORD = os.getenv("AI_DB_PASSWORD", "chabot_readonly_pw")

# The ONLY relations the AI may read.
ALLOWED_RELATIONS = {"view_worker", "view_attendance", "view_payroll", "view_loan", "view_finance"}

MAX_ROWS = int(os.getenv("AI_MAX_ROWS", "200"))

_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|"
    r"copy|call|do|merge|vacuum|analyze|comment|reindex|refresh|"
    r"attach|detach|set|lock)\b",
    re.IGNORECASE,
)

# Static description of the whitelisted views, used for the text-to-SQL prompt.
SCHEMA_DOC = """
-- Read-only PostgreSQL views. Query ONLY these. All names are lowercase.
view_worker(
  worker_id INT, full_name TEXT, name_bn TEXT, phone TEXT,
  job_role TEXT,            -- plucker | maintenance | sprayer | weeder | factory | other
  status TEXT,              -- active | on_leave | inactive
  daily_wage NUMERIC, join_date DATE, dob DATE,
  zone_name TEXT, zone_code TEXT, supervisor_username TEXT
)
view_attendance(
  attendance_id INT, work_date DATE,
  status TEXT,              -- present | absent | leave
  worker_id INT, full_name TEXT, job_role TEXT, zone_name TEXT
)
view_payroll(
  payroll_id INT, period_start DATE, period_end DATE,
  worker_id INT, full_name TEXT, job_role TEXT, zone_name TEXT,
  present_days INT,
  base_amount NUMERIC, surplus_amount NUMERIC, grade_bonus NUMERIC, gross_amount NUMERIC,
  loan_deduction NUMERIC, advance_recovery NUMERIC, other_deduction NUMERIC, net_payable NUMERIC,
  status TEXT,              -- LOWERCASE: draft | review | approved | paid  (view_payroll may be empty in demo)
  paid_at TIMESTAMP
)
view_loan(
  loan_id INT, reference TEXT, worker_name TEXT, zone_code TEXT,
  principal NUMERIC, repaid NUMERIC, outstanding NUMERIC, daily_deduction NUMERIC,
  reason TEXT,
  status TEXT,              -- UPPERCASE: PENDING | ACTIVE | OVERDUE | REPAID | REJECTED
  requested_at TIMESTAMP, decided_at TIMESTAMP
)
view_finance(
  ledger_id INT, entry_date DATE, ref_id TEXT,
  category TEXT,            -- UPPERCASE: REVENUE | EXPENSE | PAYROLL | LOAN
  account TEXT, amount NUMERIC,
  status TEXT,              -- UPPERCASE: SETTLED | PENDING
  due_date DATE, note TEXT
)
""".strip()


class SqlGuardError(Exception):
    pass


def schema_text() -> str:
    return SCHEMA_DOC


def guard_sql(sql: str) -> str:
    s = sql.strip().rstrip(";").strip()
    if not s:
        raise SqlGuardError("empty query")
    if ";" in s:
        raise SqlGuardError("multiple statements are not allowed")
    low = s.lower()
    if not (low.startswith("select") or low.startswith("with")):
        raise SqlGuardError("only SELECT queries are allowed")
    if _FORBIDDEN.search(s):
        raise SqlGuardError("query contains a forbidden keyword")
    # Some SQL functions use FROM / IN as *syntax inside a function call*
    # (EXTRACT(field FROM src), SUBSTRING(s FROM a FOR b), TRIM(... FROM ...),
    # OVERLAY(... FROM ...), POSITION(x IN y)). Neutralize that inner keyword
    # so it is not mistaken for a table reference. Real FROM/JOIN table clauses
    # (including inside subqueries) are left intact, so the allow-list check
    # below still sees every relation actually queried.
    scan = re.sub(r'\b(extract|substring|trim|overlay)\s*\(\s*[^()]*?\s+from\b', r'\1(', low)
    scan = re.sub(r'\bposition\s*\(\s*[^()]*?\s+in\b', 'position(', scan)
    refs = re.findall(r'(?:from|join)\s+"?([a-zA-Z_][\w]*)"?', scan)
    bad = [r for r in refs if r not in ALLOWED_RELATIONS]
    if bad:
        raise SqlGuardError("query references relations that are not allowed: " + ", ".join(bad))
    if not re.search(r"\blimit\b", low):
        s = f"{s}\nLIMIT {MAX_ROWS}"
    return s


def run_select(sql: str):
    safe_sql = guard_sql(sql)
    conn = psycopg2.connect(
        host=AI_DB_HOST, port=AI_DB_PORT, dbname=AI_DB_NAME,
        user=AI_DB_USER, password=AI_DB_PASSWORD,
    )
    try:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SET statement_timeout = 8000")
            cur.execute(safe_sql)
            rows = [dict(r) for r in cur.fetchall()]
        conn.rollback()
        return safe_sql, rows
    finally:
        conn.close()
