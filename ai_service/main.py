"""
Cha Bot AI service (FastAPI).

Endpoints (called by the Spring backend, never by the browser directly):
  POST /ask             -> read-only text-to-SQL Q&A over the curated views
  POST /extract-worker  -> extract worker fields from a PDF/image
  POST /report          -> narrative auto-report from aggregate KPIs
  POST /anomalies       -> LLM review of payroll / loan rows for what looks wrong
  POST /loan-score      -> credit risk judgement from a fact sheet the backend built
  POST /case-review     -> triage, duplicate check, translation and a reply draft
  GET  /health

Free LLMs only: Ollama (local) + Gemini (free tier), via a per-task router with
automatic fallback. See llm.py and README.md.
"""
import base64
import json
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import db  # noqa: E402
import prompts  # noqa: E402
import psycopg2  # noqa: E402
import psycopg2.errors  # noqa: E402
from extract import extract_worker  # noqa: E402
from llm import LLMError, complete  # noqa: E402

app = FastAPI(title="Cha Bot AI service", version="0.1.0")


class AskRequest(BaseModel):
    question: str
    role: Optional[str] = None
    user_id: Optional[int] = None


class ExtractRequest(BaseModel):
    filename: Optional[str] = None
    content_type: Optional[str] = None
    data_base64: str


class ReportRequest(BaseModel):
    metrics: dict
    language: Optional[str] = "en"
    period_label: Optional[str] = None


class AnomalyRequest(BaseModel):
    scope: str  # payroll | loan
    limit: Optional[int] = 100


class LoanScoreRequest(BaseModel):
    features: dict          # the fact sheet, computed by the Spring backend
    requested_amount: float


class CaseReviewRequest(BaseModel):
    case: dict              # the case being reviewed
    candidates: list = []   # other open cases it might duplicate
    categories: list = []   # the categories already in use, so it reuses them


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ask")
def ask(req: AskRequest):
    # 1) question -> SQL (prompt sees only the schema, no data)
    try:
        sql_raw, sql_provider = complete("text2sql", prompts.text2sql_messages(req.question))
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"No LLM available: {e}")

    sql = sql_raw.strip().strip("`").strip()

    # 2) run a guarded, read-only SELECT
    try:
        safe_sql, rows = db.run_select(sql)
    except db.SqlGuardError as e:
        return {
            "answer": f"I couldn't turn that into a safe read-only query ({e}). Try rephrasing.",
            "sql": sql,
            "row_count": 0,
            "provider": sql_provider,
        }
    except psycopg2.errors.QueryCanceled:
        return {
            "answer": "That query took too long, so I stopped it. Try narrowing it down (for example a specific month or zone).",
            "sql": sql,
            "row_count": 0,
            "provider": sql_provider,
        }
    except psycopg2.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {e}")
    except Exception as e:  # noqa: BLE001
        first = (str(e).splitlines() or ["unknown error"])[0]
        return {
            "answer": f"I built a query for your question, but it failed to run ({first}). The exact query is shown below - please share it if this keeps happening.",
            "sql": sql,
            "row_count": 0,
            "provider": sql_provider,
        }

    # 3) rows -> answer (sees real data; defaults to local Ollama)
    try:
        answer, ans_provider = complete("answer", prompts.answer_messages(req.question, rows))
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"Answer model unavailable: {e}")

    return {
        "answer": answer,
        "sql": safe_sql,
        "row_count": len(rows),
        "provider": f"sql:{sql_provider}+answer:{ans_provider}",
    }


@app.post("/extract-worker")
def extract_worker_endpoint(req: ExtractRequest):
    try:
        data = base64.b64decode(req.data_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file data")
    try:
        return extract_worker(req.filename, req.content_type, data)
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"No vision/LLM available: {e}")


# --- auto-reports / narrative summaries -------------------------------------
# The backend sends only aggregate KPIs for a period (no worker rows, no PII),
# and gets back a management-ready narrative. If this fails, the backend falls
# back to its own templated summary, so report generation never breaks.

_REPORT_SYSTEM = """You are Cha Bot, the reporting assistant inside a Bangladeshi tea-estate admin dashboard.
Write a polished, compliance-ready management report narrative from the METRICS provided (JSON).

Rules:
- Use ONLY the numbers in METRICS. Never invent figures, names or trends that are not present.
- All money is in Bangladeshi Taka; render amounts with a taka sign and thousands separators.
- Structure it as: a one-sentence executive summary, then short bold-labelled sections for
  Financial performance, Workforce & attendance, and Loans & advances, then one brief outlook
  grounded only in the given numbers.
- Be factual, concise and professional (about 150-220 words). Plain prose with short bold section
  labels only. No markdown tables, no code fences, no bullet symbols.
- Write the ENTIRE report in LANG_PLACEHOLDER.
"""


def _report_messages(metrics, language, period_label):
    lang = "Bangla" if str(language or "en").lower().startswith("bn") else "English"
    system = _REPORT_SYSTEM.replace("LANG_PLACEHOLDER", lang)
    label = period_label or (metrics.get("period") if isinstance(metrics, dict) else "") or ""
    payload = json.dumps(metrics, default=str)[:6000]
    user = f"Period: {label}\n\nMETRICS (JSON):\n{payload}"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


@app.post("/report")
def report_endpoint(req: ReportRequest):
    if not req.metrics:
        raise HTTPException(status_code=400, detail="No metrics supplied")
    try:
        text, provider = complete(
            "report", _report_messages(req.metrics, req.language, req.period_label)
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"No LLM available: {e}")
    summary = (text or "").strip()
    if not summary:
        raise HTTPException(status_code=502, detail="Model returned an empty report")
    return {"summary": summary, "provider": provider}


# --- anomaly flags -----------------------------------------------------------
# The model reads real payroll / loan rows and says what looks wrong. It reads
# them through the SAME curated read-only views as everything else -- never a
# base table -- and the SQL below is fixed here, not generated by the model.
#
# The model's output is NOT trusted. It returns a `ref` which must be an id that
# was actually in the rows we sent; the Spring backend re-checks every ref
# against the database and drops any it cannot find, so a hallucinated payslip
# can never reach the screen. Detection is the model's job; existence is ours.

_ANOMALY_SQL = {
    "payroll": """
        SELECT payroll_id, period_start, period_end, worker_id, full_name, zone_name,
               present_days, base_amount, surplus_amount, grade_bonus, gross_amount,
               loan_deduction, advance_recovery, other_deduction, net_payable, status
          FROM view_payroll
         ORDER BY payroll_id DESC
         LIMIT {limit}
    """,
    "loan": """
        SELECT loan_id, reference, worker_name, zone_code, principal, repaid,
               outstanding, daily_deduction, reason, status, requested_at, decided_at
          FROM view_loan
         ORDER BY loan_id DESC
         LIMIT {limit}
    """,
    # Ordered by date so near-duplicate spend lands next to its twin, which is
    # what makes a double payment visible at all.
    "finance": """
        SELECT ledger_id, entry_date, ref_id, category, account, amount,
               status, due_date, note
          FROM view_finance
         ORDER BY entry_date DESC, ledger_id DESC
         LIMIT {limit}
    """,
}

_ANOMALY_ID = {"payroll": "payroll_id", "loan": "loan_id", "finance": "ledger_id"}

_ANOMALY_SYSTEM = """You are a financial controls reviewer for a Bangladeshi tea estate.
You are given ROWS (JSON) from the estate's SCOPE_PLACEHOLDER records. Identify rows that
look wrong and would be worth a human checking before money moves.

Things that matter on a tea estate:
- payroll: deductions larger than gross pay; a net payable of zero; present days that are
  impossible for the period; a payslip far out of line with that same worker's other rows;
  gross pay recorded with no days present.
- loan: repaid greater than principal; an active loan whose daily deduction is zero, so it
  can never be recovered from wages; outstanding that does not equal principal minus repaid;
  a loan approved but never given a reference.
- finance: the same account charged the same amount twice within a few days, which usually
  means a supplier was paid twice; an amount far out of line with what that same account
  normally costs; a PENDING entry whose due date has already passed; a REVENUE entry that
  looks like a cost, or an EXPENSE that looks like income, judging by the account name.

Rules, all mandatory:
- Return ONLY a JSON array. No prose, no markdown fences, no commentary.
- Each element must be exactly:
  {"ref": <the ID_PLACEHOLDER value, a number>, "severity": "high"|"medium"|"low",
   "title": "<six words or fewer>", "reason": "<one plain sentence an estate admin can read>"}
- `ref` MUST be an ID_PLACEHOLDER value that appears in the ROWS. Never invent one.
- Quote real figures from the row in `reason`. Never invent numbers.
- Only flag what is genuinely questionable. If everything looks fine, return [].
- At most 12 elements, most serious first.
"""


def _anomaly_messages(scope: str, rows):
    system = (
        _ANOMALY_SYSTEM
        .replace("SCOPE_PLACEHOLDER", scope)
        .replace("ID_PLACEHOLDER", _ANOMALY_ID[scope])
    )
    payload = json.dumps(rows, default=str)[:12000]
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"ROWS (JSON):\n{payload}"},
    ]


def _parse_flags(text, scope, valid_refs):
    """Parse the model's JSON array, dropping anything malformed or invented."""
    s = (text or "").strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.lstrip().lower().startswith("json"):
            s = s.lstrip()[4:]
    start, end = s.find("["), s.rfind("]")
    if start == -1 or end == -1 or end < start:
        return [], 0
    try:
        raw = json.loads(s[start : end + 1])
    except json.JSONDecodeError:
        return [], 0
    if not isinstance(raw, list):
        return [], 0

    flags, dropped = [], 0
    for item in raw[:12]:
        if not isinstance(item, dict):
            dropped += 1
            continue
        try:
            ref = int(item.get("ref"))
        except (TypeError, ValueError):
            dropped += 1
            continue
        # first line of defence: the model may only cite rows we actually sent
        if ref not in valid_refs:
            dropped += 1
            continue
        sev = str(item.get("severity", "medium")).lower()
        if sev not in ("high", "medium", "low"):
            sev = "medium"
        title = str(item.get("title") or "").strip()[:80]
        reason = str(item.get("reason") or "").strip()[:400]
        if not title and not reason:
            dropped += 1
            continue
        flags.append(
            {"ref": ref, "severity": sev, "title": title or "Needs review", "reason": reason}
        )
    order = {"high": 0, "medium": 1, "low": 2}
    flags.sort(key=lambda f: order.get(f["severity"], 1))
    return flags, dropped


@app.post("/anomalies")
def anomalies_endpoint(req: AnomalyRequest):
    scope = (req.scope or "").strip().lower()
    if scope not in _ANOMALY_SQL:
        raise HTTPException(
            status_code=400, detail="scope must be one of: " + ", ".join(_ANOMALY_SQL)
        )
    limit = max(1, min(int(req.limit or 100), 200))

    try:
        _, rows = db.run_select(_ANOMALY_SQL[scope].format(limit=limit))
    except psycopg2.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {e}")
    except Exception as e:  # noqa: BLE001
        first = (str(e).splitlines() or ["unknown error"])[0]
        raise HTTPException(status_code=502, detail=f"Could not read {scope} rows: {first}")

    # Nothing to review is a normal answer, not an error -- and it saves an
    # LLM round trip on an empty demo database.
    if not rows:
        return {"scope": scope, "flags": [], "row_count": 0, "dropped": 0, "provider": "none"}

    id_key = _ANOMALY_ID[scope]
    valid_refs = {int(r[id_key]) for r in rows if r.get(id_key) is not None}

    try:
        text, provider = complete("anomaly", _anomaly_messages(scope, rows))
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"No LLM available: {e}")

    flags, dropped = _parse_flags(text, scope, valid_refs)
    return {
        "scope": scope,
        "flags": flags,
        "row_count": len(rows),
        "dropped": dropped,
        "provider": provider,
    }


# --- loan credit scoring -----------------------------------------------------
# The Spring backend computes the FACTS (prior loans, how each one ended, how
# much was repaid, attendance rate, requested amount as a multiple of daily
# wage, months employed) and sends them here as a fact sheet. The model's job is
# only to JUDGE those facts and explain the judgement in plain language.
#
# That split is deliberate: every number the admin sees was computed in Java and
# is reproducible, so the model cannot misreport a figure in a credit decision.
# It supplies the opinion and the wording, not the arithmetic.
#
# The recommendation is advisory. A human always makes the actual call.

_LOAN_SCORE_SYSTEM = """You are a lending officer at a Bangladeshi tea estate, assessing a
worker's request for an advance against future wages.

You are given FACTS (JSON) already computed from the estate's records. Judge the request
using ONLY those facts.

How to weigh it:
- Repayment history is the strongest signal. Loans repaid in full are good; anything that
  went overdue is a serious concern.
- Affordability matters: `requested_to_daily_wage` is how many days of wages the request is
  worth. Roughly under 15 is comfortable, 15-30 needs thought, above 30 is heavy.
- Attendance shows whether wages will actually be earned to deduct from. Note when
  attendance data is missing rather than treating it as bad.
- A long-serving worker with no history is a lower risk than a brand-new one.
- A first-time borrower is NOT automatically high risk. Say plainly that there is no history.

Return ONLY a JSON object, no prose and no markdown fences:
{"risk": "low"|"med"|"high",
 "recommendation": "approve"|"review"|"decline",
 "suggested_amount": <number or null>,
 "reason_en": "<two short sentences an estate admin can read>",
 "reason_bn": "<the same explanation in Bangla script>"}

Rules:
- "risk" must be exactly one of low, med, high. Lowercase. It is "med", never "medium".
- Set "suggested_amount" ONLY if the request looks unaffordable; give a smaller figure you
  would be comfortable with. Otherwise null.
- Quote real numbers from FACTS. Never invent a figure, a name or a history.
- reason_bn must be genuine Bangla script, not transliteration.
- Never state a final decision as if it were made. You are advising a human who decides.
"""


def _loan_score_messages(features, requested_amount):
    payload = json.dumps(features, default=str)[:4000]
    user = f"Requested amount: {requested_amount}\n\nFACTS (JSON):\n{payload}"
    return [
        {"role": "system", "content": _LOAN_SCORE_SYSTEM},
        {"role": "user", "content": user},
    ]


_RISK = {"low", "med", "high"}
_RECO = {"approve", "review", "decline"}


def _parse_score(text, requested_amount):
    """Parse the model's JSON object, coercing anything unusable to a safe default."""
    s = (text or "").strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.lstrip().lower().startswith("json"):
            s = s.lstrip()[4:]
    start, end = s.find("{"), s.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        raw = json.loads(s[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(raw, dict):
        return None

    risk = str(raw.get("risk", "")).strip().lower()
    # tolerate the model writing "medium" even though the enum label is "med"
    if risk in ("medium", "moderate"):
        risk = "med"
    if risk not in _RISK:
        risk = "med"

    reco = str(raw.get("recommendation", "")).strip().lower()
    if reco not in _RECO:
        reco = "review"

    suggested = raw.get("suggested_amount")
    try:
        suggested = None if suggested is None else float(suggested)
    except (TypeError, ValueError):
        suggested = None
    # A "suggestion" that is zero, negative, or not actually smaller than what
    # was asked for is not a suggestion. Drop it.
    if suggested is not None and (
        suggested <= 0 or suggested >= float(requested_amount or 0)
    ):
        suggested = None

    return {
        "risk": risk,
        "recommendation": reco,
        "suggested_amount": suggested,
        "reason_en": str(raw.get("reason_en") or "").strip()[:600],
        "reason_bn": str(raw.get("reason_bn") or "").strip()[:600],
    }


@app.post("/loan-score")
def loan_score_endpoint(req: LoanScoreRequest):
    if not req.features:
        raise HTTPException(status_code=400, detail="No features supplied")
    try:
        text, provider = complete(
            "loan_score", _loan_score_messages(req.features, req.requested_amount)
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"No LLM available: {e}")

    parsed = _parse_score(text, req.requested_amount)
    if parsed is None:
        raise HTTPException(status_code=502, detail="Model returned an unusable score")
    parsed["provider"] = provider
    return parsed


# --- case review (Reports & Complaints) --------------------------------------
# Four things at once, because they all read the same text and one round trip is
# far cheaper than four:
#   triage        -> a category and a priority
#   duplicates    -> does this repeat a case already open
#   translation   -> a short summary in the other language
#   reply draft   -> something the admin edits and sends, never auto-sent
#
# The backend supplies the case and the candidate duplicates; nothing is read
# from the database here. The candidate ids the model may cite are re-checked by
# the backend afterwards, so a hallucinated case number never reaches the screen.
#
# Routed to Gemini by default: this text is often Bangla, which the local model
# handles noticeably worse, and a case body is far less sensitive than a payroll
# row. Override with ROUTE_CASE_REVIEW=ollama to keep it on the machine.

_CASE_REVIEW_SYSTEM = """You are a case officer at a Bangladeshi tea estate, reviewing a complaint or
field report submitted by a worker or supervisor.

You are given THIS_CASE, a list of CANDIDATES (other open cases that might be the same
issue), and CATEGORIES already in use on this estate.

Return ONLY a JSON object, no prose and no markdown fences:
{"category": "<one of CATEGORIES, or a short new one if none fit>",
 "priority": "LOW"|"MEDIUM"|"HIGH",
 "priority_reason": "<one short sentence>",
 "duplicate_of": <a CANDIDATE id, or null>,
 "duplicate_confidence": "high"|"medium"|"low"|null,
 "duplicate_reason": "<one short sentence, or null>",
 "language": "bn"|"en"|"mixed",
 "summary_other_language": "<2 sentences: if the case is Bangla summarise in English, if English summarise in Bangla>",
 "reply_draft": "<3-4 sentences the admin could send, in the SAME language the case was written in>",
 "looks_like_spam": true|false}

Rules:
- `duplicate_of` MUST be an id present in CANDIDATES, or null. Never invent one.
  Only set it when the two describe the SAME underlying problem -- two people reporting
  one broken pump is a duplicate; two separate wage disputes are not.
- Priority guidance: HIGH means safety, injury, no water, no pay, or something getting
  worse by the hour. LOW means cosmetic or routine. Most things are MEDIUM.
- The reply draft must be respectful, acknowledge the specific problem, and say what
  happens next. Never promise money, compensation or a deadline you were not given.
- Never invent facts that are not in the case text.
- `looks_like_spam` is true only for empty, nonsense or test submissions.
"""


def _case_review_messages(case, candidates, categories):
    payload = {
        "THIS_CASE": case,
        "CANDIDATES": candidates[:20],
        "CATEGORIES": categories[:30],
    }
    return [
        {"role": "system", "content": _CASE_REVIEW_SYSTEM},
        {"role": "user", "content": json.dumps(payload, default=str)[:10000]},
    ]


_PRIORITIES = {"LOW", "MEDIUM", "HIGH"}
_CONF = {"high", "medium", "low"}


def _parse_case_review(text, valid_ids):
    s = (text or "").strip()
    if s.startswith("```"):
        s = s.strip("`")
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.lstrip().lower().startswith("json"):
            s = s.lstrip()[4:]
    start, end = s.find("{"), s.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        raw = json.loads(s[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(raw, dict):
        return None

    priority = str(raw.get("priority", "")).strip().upper()
    if priority not in _PRIORITIES:
        priority = "MEDIUM"

    # A duplicate id the backend never sent is dropped outright.
    dup = raw.get("duplicate_of")
    try:
        dup = None if dup is None else int(dup)
    except (TypeError, ValueError):
        dup = None
    if dup is not None and dup not in valid_ids:
        dup = None

    conf = str(raw.get("duplicate_confidence") or "").strip().lower()
    if dup is None or conf not in _CONF:
        conf = None

    lang = str(raw.get("language") or "").strip().lower()
    if lang not in ("bn", "en", "mixed"):
        lang = "en"

    def s600(v):
        return str(v or "").strip()[:600]

    return {
        "category": str(raw.get("category") or "").strip()[:60],
        "priority": priority,
        "priority_reason": s600(raw.get("priority_reason")),
        "duplicate_of": dup,
        "duplicate_confidence": conf,
        "duplicate_reason": s600(raw.get("duplicate_reason")) if dup is not None else None,
        "language": lang,
        "summary_other_language": s600(raw.get("summary_other_language")),
        "reply_draft": s600(raw.get("reply_draft")),
        "looks_like_spam": bool(raw.get("looks_like_spam")),
    }


@app.post("/case-review")
def case_review_endpoint(req: CaseReviewRequest):
    if not req.case:
        raise HTTPException(status_code=400, detail="No case supplied")
    valid_ids = set()
    for c in req.candidates or []:
        try:
            valid_ids.add(int(c.get("id")))
        except (TypeError, ValueError, AttributeError):
            continue
    try:
        text, provider = complete(
            "case_review",
            _case_review_messages(req.case, req.candidates or [], req.categories or []),
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"No LLM available: {e}")

    parsed = _parse_case_review(text, valid_ids)
    if parsed is None:
        raise HTTPException(status_code=502, detail="Model returned an unusable review")
    parsed["provider"] = provider
    return parsed
