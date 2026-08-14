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

---

## Leaf photo storage — known growth, deliberately NOT pruned

Every bulk photo taken at the scale is downscaled to 768px / JPEG 85
(`vision_prep.py`) and stored under `app.uploads.dir`, with one
`vision_inference` row beside it.

Measured growth:

| estate size | photos / year | image files | DB rows |
|---|---|---|---|
| 40 pluckers x 300 days | 12,000 | ~1.4 GB | ~5 MB |
| 120 pluckers x 300 days | 36,000 | ~4.1 GB | ~14 MB |

The database rows are trivial. The JPEGs are the growth.

**There is no retention job, and that is a decision, not an oversight.** Each
photo is one of two things:

1. **Evidence for a wage dispute** — the only record of what a worker actually
   handed in on a given day. Leaf weight feeds the payroll surplus.
2. **A labelled training example**, once a supervisor has ruled on it via
   `POST /leaf/vision/{id}/review`.

Deleting either is irreversible and costs more than the disk does. 1.4 GB/year
is cheap for a record that settles arguments about pay.

If it ever does need capping, the honest version is: keep every photo a human
has reviewed (`reviewed_at IS NOT NULL`) forever, and prune only UNREVIEWED
ones older than 90 days. Do not blanket-delete by age.

---

## Measuring the grader

The grader is a prompted vision-language model, not a trained classifier. Its
accuracy on Sylhet leaf is unknown until measured. Two ways:

**Against a public dataset** — for a citable number:

```bash
# 1. download TeaLeafAgeQuality (Kaggle or Mendeley)
# 2. lay it out as A/ and B/  -- handles BOTH layouts:
#      Kaggle   = YOLO detection (data.yaml + images/ + labels/)
#      Mendeley = folder-per-class (T1/ T2/ T3/ T4/)
python prep_leaf_dataset.py ~/Downloads/TeaLeafAgeQuality dataset --dry-run
python prep_leaf_dataset.py ~/Downloads/TeaLeafAgeQuality dataset
# 3. measure
python eval_leaf_grade.py dataset/
```

On the Kaggle release the class is in the LABEL FILE, not the folder name, so
each image is classified by the majority class across its bounding boxes
(ties broken by box area; a genuine 50/50 image is left out rather than guessed
at). `--split test` restricts it to one split if you want a held-out set.

`prep_leaf_dataset.py` maps T1+T2 -> A and T3+T4 -> B. **Leaf AGE is not the
same thing as pluck GRADE.** Report the result as agreement with an age-derived
proxy, not as grading accuracy — the script prints this reminder every run.

`eval_leaf_grade.py` prints accuracy, a confusion matrix, per-class recall, and
the always-guess-the-common-class baseline. Compare against that baseline, not
against zero: on a 90/10 dataset a model that always answers "A" scores 90%.

**Against your own supervisors** — for the operational number:

`GET /api/v1/leaf/vision/accuracy` counts every reading a supervisor has ruled
on in the app. Refusals are excluded rather than scored as wrong. It reports
"too few to draw a conclusion from" below 20 reviews. This number improves on
its own as people use the review buttons on the bulk photos.
