# Payroll page — press every button

Every interactive control on **Admin → Payroll & Wage**, in the order you should
press them, with what to expect. Tick as you go. About 15 minutes.

Sign in as `admin` / `admin123`.

Two things to set up first, or half the checks show ৳0 and prove nothing:

- **Abdul Karim has an ACTIVE loan** — Loans & Advances, ৳1,000 at ৳20/day,
  approved. Pending deducts nothing.
- **Today has work on it** — supervisor marked him present and weighed 30 kg
  grade A. See `MANUAL_TEST.md` steps 1–2.

---

## A. The four tabs

| # | Press | Expect |
|---|---|---|
| A1 | **Daily Pay** (first tab) | Date picker defaulting to yesterday, a card per worker. This is the daily slip. |
| A2 | **Monthly Payslips** | Table of payslips, 1st to end of this month, one row per worker. |
| A3 | **Withdrawals** | Pending / decided withdrawal requests. |
| A4 | **SMS Log** | Messages sent, with status. Empty is fine if SMS is off. |

> ☐ All four render without a blank screen or console error.

---

## B. Daily settlement card

| # | Press | Expect |
|---|---|---|
| B1 | **Run settlement now** | Settles completed days only — **today is excluded**. The "What this run moved" panel appears with four taka figures. |
| B2 | Press it **again** immediately | "Nothing to settle — every completed day is already recorded." Pressing twice is safe: `daily_settlement` is UNIQUE on (worker, day). |
| B3 | **Close today & settle** | A **card** opens (not a browser alert) explaining what happens tonight. |
| B4 | In the card, **Cancel** | Card closes. Nothing settled. |
| B5 | **Close today & settle** → **confirm** | Today is settled AND payslips rebuild. Panel shows what moved. |
| B6 | **Settle & generate** (the green one) | Settles, then rebuilds. Same panel. |

> ☐ B1's four figures — to loan, to advance, to overdraw, left payable — **add up
> to the total earned** shown underneath.
>
> ☐ After B5, Abdul Karim's loan balance has fallen by ৳20 (check Loans).
>
> ☐ Cash on Hand in Finance is **unchanged** by all of B1–B6. Settlement moves
> debt, never cash.

---

## C. The gate on Apply to Pay Run

This is the one worth showing an examiner — the system refusing a wrong action.

| # | Press | Expect |
|---|---|---|
| C1 | Look at **Apply to Pay Run** while unsettled work exists | **Greyed out.** Hover: "N days of work are not settled…" |
| C2 | Check the amber banner above | Says how many workers, how many days, oldest date. |
| C3 | Now press **Settle & generate** | Banner clears. |
| C4 | Look at **Apply to Pay Run** again | **Enabled.** |

> ☐ The button is disabled **if and only if** the banner is showing. A greyed
> button with no banner, or a banner with an enabled button, is a bug.
>
> ☐ Press **Apply to Pay Run** now — payslips rebuild and deductions stay
> filled in, because settlement already ran.

---

## D. Rates

| # | Press | Expect |
|---|---|---|
| D1 | **Edit rates** | Card with base wage, leaf quota, surplus rate, grade-A bonus. |
| D2 | Change base wage to `180`, save | "Rate last changed" updates to today. |
| D3 | **Settle & generate** | New payslips use ৳180. Already-settled days keep the old rate — a rate change starts a new period, it does not rewrite history. |
| D4 | Put it back to `170` | Housekeeping, so the next run starts clean. |

> ☐ D3: previously settled days did **not** change value.

---

## E. A payslip, stage by stage

Open **Monthly Payslips**, click a **Draft** row.

| # | Press | Expect |
|---|---|---|
| E1 | Click the row | Review drawer: attendance day by day, base, surplus, grade-A bonus, gross, each deduction, net. |
| E2 | Read the numbers | gross − loan − advance − overdraw − other = net. Check it by hand once. |
| E3 | **Submit for review** | Drawer closes, row turns amber **Review**. |
| E4 | Open it again → **Approve** | Row turns blue **Approved**. |
| E5 | Open an Approved row | **No further button.** See the note below. |
| E6 | Edit deductions on a Draft row | Only `otherDeduction` is editable — the rest are derived from settlement. |
| E7 | Try editing an Approved row | Refused: "Deductions can only be edited while a payslip is in Draft or Review." |

> ☐ Cash on Hand does **not** move at E3 or E4. Approving is a signature, not a
> payment.

### ⚠ Approved → Paid has no button

The drawer offers **Submit for review** (draft) and **Approve** (review) and
nothing else. `POST /payroll/{id}/pay` exists on the server and is never called
from anywhere in the frontend — grep for it and you get no hits.

So a payslip can reach **Approved** through the UI and no further. Whether that
matters depends on what you want "paid" to mean now that marking it paid moves
no money: it stamps `paidAt`, texts the worker that the statement is final, and
writes an audit row. Worth deciding deliberately rather than leaving it as an
accident — and worth knowing before an examiner clicks Approve and looks for
what comes next.

---

## F. Withdrawals

| # | Press | Expect |
|---|---|---|
| F1 | Note **Cash on Hand** in Finance | Write it down. |
| F2 | **Withdrawals** tab | A pending row (have the worker request ৳100 first). |
| F3 | **Pay** | Confirmation card. |
| F4 | **Cancel** | Nothing happens, row still pending. |
| F5 | **Pay** → **Approve & pay** | Row leaves pending. |
| F6 | Finance → Cash on Hand | **Fell by exactly ৳100.** |
| F7 | Press **Pay** on the same row again | Refused — a request can only be decided once. |

> ☐ F6 is the only step on this whole page where cash moves.

---

## G. Everything else on the page

| # | Press | Expect |
|---|---|---|
| G1 | **Refresh** | List reloads, nothing lost. |
| G2 | **Export CSV** | File downloads with the visible rows. |
| G3 | Status filter tabs (All / Draft / Review / …) | Table filters. **Note:** the KPI strip totals *all* rows, not the filtered ones. Known, not fixed. |
| G4 | Pagination | Pages through without losing the filter. |
| G5 | Period date pickers | Changing the period reloads. Generating builds for the period shown. |
| G6 | Amber "out of date" banner (if shown) | Names the workers whose register changed after their payslip was built. **Rebuild these payslips** fixes it — and is also gated while work is unsettled. |

---

## H. Guard rails worth demonstrating

| # | Try | Expect |
|---|---|---|
| H1 | Sign in as `supervisor`, open `/admin/payroll` | Refused — no admin console. |
| H2 | Generate before settling | Blocked, with a message naming the fix. |
| H3 | Edit deductions on an Approved slip | Refused with a readable sentence. |
| H4 | Press Run settlement twice | Second is a no-op, not a double deduction. |
| H5 | Decide the same withdrawal twice | Refused. |

---

## The one-line summary

Of the ~27 controls on this page, exactly **one** moves money: *Approve & pay*
on a withdrawal. Settlement moves debt. Everything else records, recomputes or
displays. If you can say that and then show it, you have explained the page.

---

## Running the automated half

```bash
cd backend
./mvnw test -Pselenium -Dselenium.slowMo=900
```

- `T02` covers C1–C4 (the gate)
- `T06` covers B3–B5 and E1 (field to payslip)
- `T05` covers F1–F6 (cash moves)
- `T04` covers H2–H3

Sections D, E3–E7 and G are **not** automated — walk those by hand.
