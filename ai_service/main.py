"""
Cha Bot AI service (FastAPI).

Endpoints (called by the Spring backend, never by the browser directly):
  POST /ask             -> read-only text-to-SQL Q&A over the curated views
  POST /extract-worker  -> extract worker fields from a PDF/image
  POST /report          -> narrative auto-report from aggregate KPIs
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
