"""
LLM router for the Cha Bot AI service.

Two FREE providers, chosen per task:
  - Ollama  (local, private, unlimited)  -> anything that sees real row data
  - Gemini  (free tier, stronger)        -> schema-only reasoning + Bangla/vision

Every call automatically falls back to the other provider if the primary fails,
and every failure is printed to the console so the real error is never hidden.
"""
import os

import requests

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "llama3.2-vision")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai",
)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# Which provider leads each task; the fallback is always the other one.
# text2sql/report/extract only ever see SCHEMA or aggregate/anonymised input,
# so they are safe to route to Gemini. answer sees real rows -> local Ollama.
ROUTES = {
    "text2sql": os.getenv("ROUTE_TEXT2SQL", "gemini"),
    "answer": os.getenv("ROUTE_ANSWER", "ollama"),
    "extract": os.getenv("ROUTE_EXTRACT", "gemini"),
    "report": os.getenv("ROUTE_REPORT", "gemini"),
    # anomaly detection reads real payroll / loan rows, so it defaults to the
    # LOCAL model for the same reason "answer" does -- row-level money data
    # should not leave the machine unless the operator opts in.
    "anomaly": os.getenv("ROUTE_ANOMALY", "ollama"),
    # loan scoring sees one worker's fact sheet (a named individual's borrowing
    # and attendance record), so it stays local by default too. Gemini leads
    # only if the operator sets ROUTE_LOAN_SCORE=gemini -- worth doing for the
    # Bangla explanation, which Gemini writes noticeably better.
    "loan_score": os.getenv("ROUTE_LOAN_SCORE", "ollama"),
    # case review reads complaint text, which is frequently Bangla and needs a
    # Bangla reply drafted back. Gemini is markedly better at that than the
    # local model, and a complaint body is far less sensitive than a payroll
    # row. Set ROUTE_CASE_REVIEW=ollama to keep it on the machine instead.
    "case_review": os.getenv("ROUTE_CASE_REVIEW", "gemini"),
}

TIMEOUT = int(os.getenv("LLM_TIMEOUT_SECONDS", "60"))


class LLMError(Exception):
    pass


def _gemini_available() -> bool:
    return bool(GEMINI_API_KEY)


def _with_images(messages, images):
    """Attach base64 data-URL images to the last user message (OpenAI vision)."""
    if not images:
        return messages
    msgs = [dict(m) for m in messages]
    for m in reversed(msgs):
        if m.get("role") == "user":
            content = [{"type": "text", "text": m["content"]}]
            for img in images:
                content.append({"type": "image_url", "image_url": {"url": img}})
            m["content"] = content
            break
    return msgs


def _ollama_chat(messages, model=None, images=None):
    payload = {
        "model": model or OLLAMA_MODEL,
        "messages": _with_images(messages, images),
        "temperature": 0,
    }
    r = requests.post(f"{OLLAMA_BASE_URL}/v1/chat/completions", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _gemini_chat(messages, model=None, images=None):
    if not _gemini_available():
        raise LLMError("GEMINI_API_KEY is not set")
    payload = {
        "model": model or GEMINI_MODEL,
        "messages": _with_images(messages, images),
        "temperature": 0,
    }
    r = requests.post(
        f"{GEMINI_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {GEMINI_API_KEY}"},
        json=payload,
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


_PROVIDERS = {"ollama": _ollama_chat, "gemini": _gemini_chat}


def _describe(provider, model, e):
    resp = getattr(e, "response", None)
    if resp is not None:
        body = (resp.text or "").replace("\n", " ")[:400]
        return f"{provider}({model}) HTTP {resp.status_code}: {body}"
    return f"{provider}({model}) {type(e).__name__}: {e}"


def complete(task: str, messages, images=None):
    """Run a chat completion for `task`, with automatic fallback.

    Returns (text, provider_used). Raises LLMError only if EVERY provider
    failed, and the message then lists why each one failed.
    """
    primary = ROUTES.get(task, "ollama")
    order = [primary, "gemini" if primary == "ollama" else "ollama"]
    if not _gemini_available():
        order = [p for p in order if p != "gemini"] or ["ollama"]

    errors = []
    for provider in order:
        model = None
        if task == "extract" and provider == "ollama":
            model = OLLAMA_VISION_MODEL if images else OLLAMA_MODEL
        try:
            return _PROVIDERS[provider](messages, model=model, images=images), provider
        except Exception as e:  # noqa: BLE001 - try the fallback provider
            desc = _describe(provider, model or "default", e)
            print(f"[llm] task={task} provider FAILED -> {desc}", flush=True)
            errors.append(desc)
            continue
    raise LLMError(f"All providers failed for task '{task}': " + "  ||  ".join(errors))
