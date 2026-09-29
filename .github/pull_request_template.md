## What this changes

<!-- One or two sentences. What is different after this merges? -->

## Why

<!-- The problem, not the solution. Link an issue if there is one. -->

## How I verified it

<!-- Be specific. "It builds" is not verification.
     For money changes: which flow did you run, and which ledger rows appeared?
     For UI: which browsers/screens?
     For AI: sample size, or say it was not measured. -->

- [ ] Backend compiles / frontend builds
- [ ] I ran the flow end to end, not just the endpoint
- [ ] No unrelated file was touched

## Anything I did NOT test

<!-- Say it here rather than letting the reviewer discover it.
     "I could not verify X" is always better than a confident guess. -->

---

### If this touches money, migrations, auth or the AI service

- [ ] Any new migration is append-only and takes the next free number
- [ ] Postings are idempotent (existence check on sourceType + sourceId)
- [ ] `BigDecimal` scale 2, `HALF_UP` — no `double` anywhere near money
- [ ] Any statistical or AI claim states its sample size, or says it was not measured
