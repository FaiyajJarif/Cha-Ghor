"""Turn an uploaded PDF/image into structured worker fields."""
import base64
import io
import json
import re

import pdfplumber

import prompts
from llm import complete

ALLOWED_FIELDS = {
    "fullName", "nameBn", "phone", "nationalId",
    "dob", "joinDate", "jobRole", "dailyWage", "zoneName",
}


def _clean_json(text: str):
    t = text.strip()
    t = re.sub(r"^```(json)?", "", t).strip()
    t = re.sub(r"```$", "", t).strip()
    m = re.search(r"\{.*\}", t, re.DOTALL)
    if m:
        t = m.group(0)
    return json.loads(t)


def _pdf_text(data: bytes) -> str:
    out = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages[:5]:
            out.append(page.extract_text() or "")
    return "\n".join(out).strip()


def extract_worker(filename: str, content_type: str, data: bytes):
    is_pdf = (content_type or "").endswith("pdf") or (filename or "").lower().endswith(".pdf")
    images = None
    text_hint = ""

    if is_pdf:
        try:
            text_hint = _pdf_text(data)
        except Exception:
            text_hint = ""
    else:
        b64 = base64.b64encode(data).decode("ascii")
        ct = content_type or "image/jpeg"
        images = [f"data:{ct};base64,{b64}"]

    messages = prompts.extract_messages(text_hint)
    raw, provider = complete("extract", messages, images=images)

    try:
        parsed = _clean_json(raw)
    except Exception:
        return {
            "fields": {},
            "warnings": ["Could not read the document clearly. Please fill the form manually."],
            "provider": provider,
        }

    warnings = parsed.pop("warnings", []) or []
    if is_pdf and not text_hint:
        warnings.append("This looks like a scanned PDF; extraction may be incomplete. Verify every field.")

    fields = {k: v for k, v in parsed.items() if k in ALLOWED_FIELDS and v not in (None, "")}
    return {"fields": fields, "warnings": warnings, "provider": provider}
