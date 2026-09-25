# extras/

Everything in this project that is **read** rather than **run**.

The four folders at the repository root — `ai_service/`, `backend/`, `docker/`,
`frontend/` — are the system. `sql/` and `scripts/` stay at the root too,
because they are operational: commands in the guides below, and a comment in
`backend/src/main/resources/application.yaml`, invoke them by those paths.

| Folder | Contents |
|---|---|
| `guides/` | DEPLOY, MANUAL_TEST, PAYROLL_TEST_WORKFLOW, PRESENTATION, SECURITY |
| `report/` | Course project report (.docx) |
| `diagrams/` | draw.io sources for every figure in the report |
| `mockup/` | Standalone bKash disbursement mockups (open in a browser) |
| `db/` | A database dump kept for reference |
| `misc/` | One-off scripts kept for reference, not part of any build |

## guides/

- **DEPLOY.md** — deploying to Render and Neon, and the traps that cost time.
- **MANUAL_TEST.md** — one worker, one day, end to end. The script to follow
  in front of an examiner.
- **PAYROLL_TEST_WORKFLOW.md** — every control on the Payroll page, in order,
  with what each should do.
- **PRESENTATION.md** — demo running order, speaking notes and the questions
  to expect.
- **SECURITY.txt** — security posture notes.

Run every command in these guides **from the repository root**, not from here.

## diagrams/

Open a `.drawio` file at app.diagrams.net (File → Open from → Device), export
as PNG, and place it in the report. Colours follow the application palette:
`#14493B` deep green, `#C0F28B` lime, `#F4FFE9` page tint, `#E2136E` for bKash.

| File | Report figure |
|---|---|
| `01-architecture.drawio` | Figure 1 — three layers plus analytics service |
| `02-auth-flow.drawio` | Figure 2 — login and role routing |
| `03-supervisor-flow.drawio` | Figure 3 — field capture, including offline |
| `04-settlement-flow.drawio` | Figure 4 — settlement through disbursement |
| `05-worker-flow.drawio` | Figure 5 — worker console |
| `06-use-case.drawio` | Figure 6 — use case diagram |
| `07-er-diagram.drawio` | Figure 17 — entity relationships |

## db/

`chaghor_backup.sql` is a dump of a development database. It is **not** a
migration — Flyway owns the schema, in `backend/src/main/resources/db/migration`.
Treat anything in it as development data.
