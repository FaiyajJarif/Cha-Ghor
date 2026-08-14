# === CHA BOT AUTO-REPORT (narrative summaries) ===
# Appended by chaghor_autoreports_ai. Turns a period's aggregate KPIs into a
# polished narrative. Only anonymised aggregates are sent to the LLM (no rows).
import json as _report_json  # noqa: E402


class ReportRequest(BaseModel):
    metrics: dict
    language: Optional[str] = "en"
    period_label: Optional[str] = None


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
    payload = _report_json.dumps(metrics, default=str)[:6000]
    user = f"Period: {label}\n\nMETRICS (JSON):\n{payload}"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


@app.post("/report")
def report_endpoint(req: ReportRequest):
    try:
        text, provider = complete(
            "report", _report_messages(req.metrics, req.language, req.period_label)
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"No LLM available: {e}")
    return {"summary": (text or "").strip(), "provider": provider}
