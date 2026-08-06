# Cha Bot AI service

A small FastAPI service that powers the Workforce AI: read-only Q&A and
Add-Worker autofill. Uses **free** LLMs only -- Ollama (local) + Gemini (free
tier) -- via a per-task router with automatic fallback.

```
browser (Cha Bot widget)
   -> Spring  /api/v1/chatbot/*   (injects role + user id from the JWT, RBAC)
      -> FastAPI ai_service       (this)
         -> Postgres (chabot_readonly, SELECT on 2 views only)
         -> Ollama / Gemini
```

## 1. One-time database setup

Apply the app migrations first (this creates `view_worker` + `view_attendance`
via `V12__ai_views.sql`). Then create the least-privilege role:

```bash
psql -h localhost -p 5433 -U chaghor -d chaghor -f sql/ai_readonly_setup.sql
```

## 2. Install + configure

```bash
cd ai_service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # edit if needed
```

### Models (both free)
- **Ollama** (default for anything touching real data):
  ```bash
  ollama pull llama3.1
  ollama pull llama3.2-vision   # only needed for local document autofill
  ```
- **Gemini** (optional, better SQL/Bangla/vision): put a free API key in
  `GEMINI_API_KEY`. Leave it blank to run Ollama-only.

### Privacy routing (already set in `.env.example`)
- `text2sql` -> Gemini: the prompt sees only the **view schema**, never data.
- `answer` -> Ollama: sees real rows (may contain PII), so it stays **local**.
- `extract` -> Gemini for accuracy; switch `ROUTE_EXTRACT=ollama` to keep real
  worker documents fully local.
Every task falls back to the other provider automatically.

## 3. Run

```bash
uvicorn main:app --port 8000 --reload
```

Point Spring at it with `ai.service.url=http://localhost:8000` (this is the
default, so nothing is needed unless you change the port).

## Endpoints
- `POST /ask` `{question, role, user_id}` -> `{answer, sql, row_count, provider}`
- `POST /extract-worker` `{filename, content_type, data_base64}` ->
  `{fields, warnings, provider}`
- `GET /health`

## Safety
- Read-only DB role, `SELECT` on 2 views only.
- Every query runs in a READ ONLY transaction with an 8s statement timeout.
- A SQL guard rejects non-SELECT statements, multiple statements, forbidden
  keywords, and any relation outside `view_worker` / `view_attendance`.
- The AI only ever **drafts**; writes (adding a worker) always go through the
  normal Spring API after the admin confirms.
