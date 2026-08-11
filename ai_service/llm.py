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
    # Leaf grading is a VISION task. It defaults to gemini because the local
    # Ollama model in this stack is text-only -- a photo sent there comes back
    # as a confident guess about an image it never saw, which is the worst
    # possible failure for something that suggests a pay grade.
    "leaf_grade": os.getenv("ROUTE_LEAF_GRADE", "gemini"),
    # Health assessment is also vision-only, same reasoning as leaf_grade.
    "leaf_health": os.getenv("ROUTE_LEAF_HEALTH", "gemini"),
    "report": os.getenv("ROUTE_REPORT", "gemini"),
    # Pluck advice is a few sentences over a small table -- no vision, no SQL,
    # nothing that needs a frontier model. Defaults to the local model so the
    # Fields board never spends the Gemini free-tier quota that the leaf photo
    # work actually needs.
    "pluck_advice": os.getenv("ROUTE_PLUCK_ADVICE", "ollama"),
    # A few sentences over one small reading. No vision, no SQL, nothing that
    # needs a frontier model -- and it can be asked for repeatedly through a
    # day, so it stays local rather than eating the Gemini free tier the leaf
    # photo work actually needs.
    "weather_brief": os.getenv("ROUTE_WEATHER_BRIEF", "ollama"),
    # One short sentence, but it is going to real phones in Bangla, so this is
    # the one place a stronger model earns its keep. Still defaults to local:
    # the supervisor reads and can edit every character before it sends.
    "sms_rewrite": os.getenv("ROUTE_SMS_REWRITE", "ollama"),
    # A short note about somebody's debt. Local by default like everything
    # worker-facing, so it cannot exhaust the Gemini quota, and because the
    # figures are already computed -- the model only phrases them.
    "loan_note": os.getenv("ROUTE_LOAN_NOTE", "ollama"),
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

# A TOTAL budget for one complete() call, NOT a per-provider one.
#
# THIS WAS THE BUG BEHIND "HttpTimeoutException: request timed out".
#   complete() tries the primary provider and then the fallback, in sequence.
#   With 60s applied to EACH, one call could legitimately run for 120s -- while
#   every Java caller gave up between 30s and 60s. So the backend hung up
#   partway through the fallback attempt and logged a timeout, which reads like
#   the AI service is down when it is in fact still working.
#
#   Worse, it meant the fallback could never finish for a slow primary: Java's
#   deadline always arrived first. The Ollama backup was effectively unreachable
#   whenever it was most needed.
#
# Splitting the budget across the attempts keeps the whole call inside one
# predictable ceiling, so the Java timeout is a genuine backstop instead of the
# thing that fires first.
TIMEOUT = int(os.getenv("LLM_TIMEOUT_SECONDS", "60"))


# VISION NEEDS ITS OWN, LARGER BUDGET.
#
# A sentence of text comes back in a few seconds. A photo does not:
#   * Gemini vision is commonly 20-40s for one image
#   * qwen2.5vl:7b running locally is routinely 40-90s, and much worse cold
#
# Worse, Ollama serves one model SERIALLY. A supervisor attaching photos for
# five workers in a row puts five requests in flight; the fifth sits in a queue
# behind the other four while its own deadline runs down. That is why the first
# few weigh-ins graded fine and the last ones 503'd.
#
# Splitting a 60s text budget in half gave each provider 30s, which is simply
# not enough for either vision path -- so both timed out and the endpoint
# returned 503 even though nothing was broken.
VISION_TIMEOUT = int(os.getenv("LLM_VISION_TIMEOUT_SECONDS", "150"))


def _attempt_timeout(attempts: int, vision: bool = False) -> int:
    """Seconds to allow ONE provider, given how many will be tried.

    The budget is TOTAL for the whole complete() call, so the Java caller's
    deadline only has to exceed one number rather than N x one number.
    """
    budget = VISION_TIMEOUT if vision else TIMEOUT
    return max(10, budget // max(1, attempts))


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


def _post_chat(url, payload, headers=None, json_mode=False, timeout=None):
    """One POST, with an automatic retry that drops response_format.

    WHY THE RETRY. Asking for JSON is the difference between a small local
    model returning a clean object and returning prose with an object buried in
    it -- which the parsers reject, producing a 502 that reads like the model
    was never reached. But `response_format` is not universally supported: an
    older Ollama build, or a model that does not implement it, answers 400.
    Failing outright there would take a working provider offline for the sake
    of a formatting hint, so the hint is dropped and the call repeated.
    """
    if json_mode:
        payload = dict(payload, response_format={"type": "json_object"})
    secs = timeout or TIMEOUT
    r = requests.post(url, json=payload, headers=headers, timeout=secs)
    if json_mode and r.status_code == 400:
        print("[llm] response_format rejected; retrying without it", flush=True)
        payload = {k: v for k, v in payload.items() if k != "response_format"}
        r = requests.post(url, json=payload, headers=headers, timeout=secs)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def _ollama_chat(messages, model=None, images=None, json_mode=False, timeout=None):
    payload = {
        "model": model or OLLAMA_MODEL,
        "messages": _with_images(messages, images),
        "temperature": 0,
    }
    return _post_chat(
        f"{OLLAMA_BASE_URL}/v1/chat/completions",
        payload,
        json_mode=json_mode,
        timeout=timeout,
    )


def _gemini_chat(messages, model=None, images=None, json_mode=False, timeout=None):
    if not _gemini_available():
        raise LLMError("GEMINI_API_KEY is not set")
    payload = {
        "model": model or GEMINI_MODEL,
        "messages": _with_images(messages, images),
        "temperature": 0,
    }
    return _post_chat(
        f"{GEMINI_BASE_URL}/chat/completions",
        payload,
        headers={"Authorization": f"Bearer {GEMINI_API_KEY}"},
        json_mode=json_mode,
        timeout=timeout,
    )


_PROVIDERS = {"ollama": _ollama_chat, "gemini": _gemini_chat}


def _describe(provider, model, e):
    resp = getattr(e, "response", None)
    if resp is not None:
        body = (resp.text or "").replace("\n", " ")[:400]
        if resp.status_code == 429:
            # The single most common failure on a free key, and the one whose
            # raw body is least useful. Say what it is and when it clears.
            return (f"{provider}({model}) DAILY QUOTA EXHAUSTED - the free Gemini tier "
                    f"allows a limited number of requests per day and they are used up. "
                    f"It resets at midnight Pacific time. Grade by hand until then.")
        return f"{provider}({model}) HTTP {resp.status_code}: {body}"
    return f"{provider}({model}) {type(e).__name__}: {e}"


def complete(task: str, messages, images=None, json_mode=False):
    """Run a chat completion for `task`, with automatic fallback.

    Returns (text, provider_used). Raises LLMError only if EVERY provider
    failed, and the message then lists why each one failed.

    `json_mode=True` asks the provider for a JSON object. Pass it for every
    task whose response is parsed rather than displayed. Without it the
    fallback provider can answer perfectly well in prose and the caller still
    fails -- which looks identical, from outside, to the fallback not working
    at all.
    """
    primary = ROUTES.get(task, "ollama")
    order = [primary, "gemini" if primary == "ollama" else "ollama"]
    if not _gemini_available():
        order = [p for p in order if p != "gemini"] or ["ollama"]

    # Split the budget across the providers that will actually be tried.
    # `images` is what makes this a vision call, and vision gets far longer.
    per_attempt = _attempt_timeout(len(order), vision=bool(images))

    errors = []
    for provider in order:
        # Skip a provider that cannot possibly serve this request rather than
        # calling it and reporting a confusing failure.
        if images and provider == "ollama" and not OLLAMA_VISION_MODEL:
            errors.append("ollama: no OLLAMA_VISION_MODEL configured, cannot read images")
            continue
        model = None
        if provider == "ollama" and images:
            # ANY task that sends an image needs the vision model, not just
            # "extract". This was hardcoded to one task, so leaf grading fell
            # back to the text-only model and Ollama answered:
            #   "Multimodal data provided, but model does not support
            #    multimodal requests"
            # which read like a broken fallback when it was the wrong model.
            model = OLLAMA_VISION_MODEL
        try:
            return (
                _PROVIDERS[provider](
                    messages,
                    model=model,
                    images=images,
                    json_mode=json_mode,
                    timeout=per_attempt,
                ),
                provider,
            )
        except Exception as e:  # noqa: BLE001 - try the fallback provider
            desc = _describe(provider, model or "default", e)
            print(f"[llm] task={task} provider FAILED -> {desc}", flush=True)
            errors.append(desc)
            continue
    raise LLMError(f"All providers failed for task '{task}': " + "  ||  ".join(errors))
