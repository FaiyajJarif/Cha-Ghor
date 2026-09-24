# Cha Ghor — demonstration suite

Five claims, proven in a browser you can watch. Built for the viva, not for CI.

| # | Claim | Where the proof actually lands |
|---|-------|--------------------------------|
| 01 | A worker cannot reach the admin console **or its API** | UI redirect *and* a 403 from Spring Security |
| 02 | Password strength and role are enforced **server-side** | `POST /auth/signup` direct, no browser |
| 03 | Loan: request → approve → **recovered from daily settlement** | `loan.repaid` before vs after |
| 04 | Payslip cannot skip a stage; ledger follows the money | state machine + cash-on-hand delta |
| 99 | Brute-forcing the login is refused | sixth attempt returns 429 |

---

## Before you run it

**Postgres and the backend must already be running.** The suite starts Vite for
you; it does **not** start the backend, because Spring Boot takes long enough
that Playwright would time out with an unhelpful error.

```bash
cd docker   && docker compose up -d     # terminal 1
cd backend  && ./mvnw spring-boot:run   # terminal 2
```

You do **not** need `npm run dev` running — `webServer` starts it, and reuses
yours if you already have one.

The first thing the run does is check the backend is answering, and stop with a
plain-English message if it is not. That check lives in `auth.setup.js`, which
is a **setup project**, not `globalSetup` — `globalSetup` runs *before*
Playwright starts `webServer`, so sign-in code there tries to open the app
before Vite exists and dies on a bare 30-second `TimeoutError`. If you ever move
it back, that is the bug you will get.

First time only:

```bash
cd frontend
npm install
npx playwright install chromium
```

## Running it

```bash
npm run demo        # headed, slowed down, one window — this is the viva mode
npm run demo:ui     # Playwright's runner: test list, timeline, time-travel
npm run demo:fast   # headless, for checking nothing broke
npm run demo:report # reopen the last HTML report
```

`npm run demo` opens one Chromium window and walks the scenarios in order, with
a caption across the bottom of the page naming the claim being proven. The
captions are injected by the suite — no production code exists for their
benefit.

## Reading the result

The HTML report (`demo-report/`) keeps a screenshot and a full trace for every
step, passing or failing. That folder is the appendix: it survives the demo and
can be opened later without re-running anything.

---

## Things that will bite you

**Re-running immediately fails.** Scenario 99 deliberately exhausts the login
budget — 5 attempts per 60 seconds per IP. `global-setup` logs in three times,
so a run started inside that window fails at setup with a 429. Wait a minute.
This is the defence working, not a bug.

**Scenario 04 skips if no payslip is in Draft.** Re-running processes the same
period. Reset with `sql/dev_reset_seed.sql` (idempotent) or move to a fresh
period.

**Scenario 03 may report NOT DEMONSTRATED.** If the worker has no settled
earning days there is nothing to recover from, so `loan.repaid` correctly does
not move. The suite says so rather than showing a green tick that implies more
than it proved. To see the recovery itself, mark attendance and weigh in leaf
for a past day first, then re-run.

**Pointing at a phone or another machine:**

```bash
DEMO_BASE_URL=http://192.168.0.108:5173 \
DEMO_API_URL=http://192.168.0.108:8080/api/v1 npm run demo
```

---

## What this is not

It asserts things we already believe, so it is **evidence, not test coverage**.
It will catch a regression before the viva, which is worth something, but do not
present it as a test suite.

Two specific limits worth stating out loud if asked:

- **It does not verify the wage formula.** One payslip on screen proves the
  lifecycle, not the arithmetic. The randomised simulations already in the
  project are the better evidence for that.
- **It cannot reproduce iOS Safari.** Playwright's WebKit is not Mobile Safari;
  behaviours like auto-zoom on a sub-16px input do not occur here. Only a real
  device finds those.
