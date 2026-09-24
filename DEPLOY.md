# Deploying Cha Ghor for free

Three pieces, three hosts, no credit card:

| Piece | Where | Why |
|---|---|---|
| **Postgres + pgvector** | **Neon** free | scale-to-zero, resumes instantly, has pgvector |
| **Backend** (Spring Boot) | **Render** free web service | 512 MB, no card, auto HTTPS |
| **Frontend** (Vite build) | **Render Static** / Netlify / Vercel | static, no cold start |
| `ai_service` | **skip at first** | every AI call degrades by design — see below |

As of September 2026, **Fly.io has no free tier for new accounts** and **Koyeb closed its free
Starter tier** after the Mistral acquisition. Render is the remaining no-card option that runs a
JVM.

---

## Why the database is the constrained choice

`V1__init.sql` line 8 runs `CREATE EXTENSION IF NOT EXISTS vector`, and it is **not decorative** —
`document_embedding.embedding` is a real `VECTOR(1536)` column with an HNSW index:

```sql
CREATE INDEX idx_docemb_embedding ON document_embedding
    USING hnsw (embedding vector_cosine_ops);
```

`IF NOT EXISTS` only skips when the extension is *already created*. On a Postgres where pgvector is
not **available**, V1 fails, Flyway aborts, and the backend will not boot at all. So a generic free
Postgres is not enough.

Neon and Supabase both ship pgvector on their free plans. Prefer **Neon**: it scales to zero and
resumes instantly, whereas a Supabase project *pauses after a week of inactivity* and has to be
resumed by hand — which is exactly the morning of your demo.

HNSW needs pgvector ≥ 0.5. Both are well past that; any other provider, check first.

---

## 1. Database — Neon

Create a project, copy the connection string, and split it into the three variables the backend
wants. It looks like:

```
postgresql://USER:PASSWORD@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

- `DB_URL` = `jdbc:postgresql://ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
  (note the `jdbc:` prefix, and keep `sslmode=require` — Neon refuses plaintext)
- `DB_USERNAME` = the USER part
- `DB_PASSWORD` = the PASSWORD part

Use the **pooler** host. And override the pool size:

```
DB_POOL_MAX=5
DB_POOL_MIN=1
```

`application.yaml` defaults to `maximum-pool-size: 20`, which is sized for a laptop Postgres.
Twenty connections against a free Neon branch will exhaust the connection allowance and you will
see the failure as random request timeouts, not as an obvious "too many connections".

Flyway runs V1–V44 on first boot. Nothing to import.

---

## 2. Backend — Render

New → Web Service → connect the repo → **Root Directory `backend`**.

- Build: `./mvnw clean package -DskipTests`
- Start: `java -Xmx400m -jar target/*.jar`

`-Xmx400m` matters. The free instance is 512 MB total; a JVM left to pick its own heap on a
container that reports more memory than it gets will be killed by the OOM reaper mid-request.

### Environment variables

| Variable | Value | Why it is not optional |
|---|---|---|
| `APP_JWT_SECRET` | 48+ random chars | **`JwtService` refuses to start** on the dev default outside a dev profile. You built that guard; it will stop the deploy dead if you skip this. |
| `APP_CORS_ALLOWED_ORIGINS` | `https://your-frontend.onrender.com` | Controls **both** REST and the WebSocket handshake. Wrong here = page loads, login says "invalid username", and you go hunting in the auth code for a bug that is not there. |
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | from Neon | |
| `DB_POOL_MAX` | `5` | see above |
| `SMS_PROVIDER` | **`mock`** | see below — this one will break your deploy if you forget it |
| `APP_WEATHER_ENABLED` | `true` | Open-Meteo is keyless, so this still works in the cloud |

Generate the secret with:

```bash
openssl rand -base64 48
```

Do not paste it into the repo or into a chat — set it in Render's dashboard only.

### SMS_PROVIDER=mock is mandatory

The estate's transport is `macmessages`, which drives **Messages.app on the Mac the backend runs
on** via `osascript`. There is no Messages.app in a Linux container. Left as the default, every
send path shells out to a binary that does not exist and times out after 20 seconds.

Set `SMS_PROVIDER=mock`. Log rows are still written with status `mock`, so the delivery log, the
worker's টাকার খবর card and the SMS panel all keep working — they just do not transmit. That is
the correct behaviour for a public demo anyway: nobody's real phone should receive anything from a
deployment a marker is clicking through.

### Java version

`backend/pom.xml` says `<java.version>17</java.version>`, but `CLAUDE.md` §5 says Java 21. **The
pom is what builds.** Set Render's runtime to Java 17, or fix the discrepancy first — do not assume
21 because the brief says so. (Worth reconciling regardless; one of the two is wrong.)

---

## 3. Frontend — static

New → Static Site → **Root Directory `frontend`**.

- Build: `npm ci && npm run build`
- Publish directory: `dist`

**One build-time variable, and it is the one people miss:**

```
VITE_API_URL=https://your-backend.onrender.com/api/v1
```

Without it, `src/lib/config.js` derives the API host from `window.location.hostname` — which on a
static host is the *frontend's* domain, so every call 404s against a server that does not serve the
API. That fallback exists for phone-on-LAN testing and is wrong for a split deployment.

`WS_BASE` is derived from `API_BASE`, so setting this one variable fixes the sockets too.

---

## 4. ai_service — leave it off at first

Thirteen AI features, and **every AI call degrades by design** (`CLAUDE.md` §3): if `ai_service` is
unreachable the page keeps working and says why. So the app is fully usable without it, and a third
free service is a third cold start.

When you do want it: Render web service, root `ai_service`, start
`uvicorn main:app --host 0.0.0.0 --port $PORT`, and set `AI_SERVICE_URL` on the backend to its URL.
Put the Gemini key in Render's dashboard, never in the repo — `ai_service/.env` has held a live key
before.

Note the two curated-view scripts Flyway never runs (`ai_service/sql/ai_views_finance.sql`,
`ai_readonly_setup.sql`). Cha Bot passes its security gate and then fails with *relation does not
exist* if they are missing, which reads as a broken bot rather than missing setup. Run them against
Neon by hand.

---

## What free costs you

**Cold starts.** The free backend spins down after 15 minutes idle, and a Spring Boot wake is
30–50 seconds. First page load after lunch looks like a broken site.

Before a presentation, **open the app five minutes early and leave the tab open.** If you want it
warm permanently, point a free uptime pinger at a cheap endpoint every 10 minutes — but that burns
your monthly instance hours, so only do it on the day.

**Uploads are ephemeral.** `APP_UPLOADS_DIR` defaults to a relative `uploads/`, which on Render free
is container-local disk. Every redeploy and every spin-down wipes it, so field-case evidence photos
disappear while their database rows remain. Acceptable for a demo; say so rather than being
surprised by it. A persistent disk is a paid feature — the free fix is not to rely on uploads during
the demo.

**No HTTPS certificate work.** Render terminates TLS for you, so leave `APP_SSL_ENABLED` false. The
`dev-keystore.p12` path is for LAN phone testing, not for this.

---

## Order of operations

1. Neon project → copy credentials.
2. Deploy the **backend** with all variables above. Watch the log for Flyway applying V1–V44 and
   for `Started ChaghorApplication`. If it dies at startup, read the *first* error — a duplicate
   Lombok cascade will bury it under ~99 "cannot find symbol".
3. Note the backend URL. Deploy the **frontend** with `VITE_API_URL` pointing at it.
4. Note the frontend URL. Go back and set `APP_CORS_ALLOWED_ORIGINS` to it. **Redeploy the
   backend** — CORS is read at boot.
5. Log in as `admin` / `admin123` and **change that password immediately**; this is now a public
   URL.
6. Run `sql/add_two_test_workers.sql` against Neon if you want the demo workforce.

Step 4 is a chicken-and-egg you cannot avoid: each side needs the other's final URL.

---

## Sanity check after deploying

```bash
# 1. is it up at all (expect 401, NOT a timeout — 401 means Spring is answering)
curl -i https://your-backend.onrender.com/api/v1/workers

# 2. can you get a token
curl -s -X POST https://your-backend.onrender.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

A **timeout** on the first call is a cold start — wait 50 seconds and retry before debugging
anything. A **401** means the deploy is healthy.

If the login page loads but rejects correct credentials, it is CORS, not auth. Check
`APP_CORS_ALLOWED_ORIGINS` matches the frontend origin exactly, including `https://` and with no
trailing slash.
