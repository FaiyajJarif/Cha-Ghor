# Cha Ghor — manual walkthrough

One worker, one day, end to end. Roughly 10 minutes. This is the script to
follow in front of an examiner, and the same path the Selenium suite drives.

Three terminals first:

```bash
cd docker    && docker compose up -d
cd backend   && ./mvnw spring-boot:run
cd frontend  && npm run dev
```

Logins: `admin`/`admin123`, `supervisor`/`super123`, `worker`/`worker123`.

We use **Abdul Karim, worker #1 (CG001)** throughout, because the demo `worker`
login is linked to him — so the same person appears in all three consoles.

---

## Before you start — make it worth watching

Give Abdul Karim a loan, or the deduction column stays ৳0 all the way through
and the most interesting part of the flow shows nothing.

**Admin → Loans & Advances → new request for Abdul Karim**, say ৳1,000 at ৳20/day,
then approve it. It must reach **ACTIVE**, not PENDING — a pending loan deducts
nothing.

> Check: the loan row shows Abdul Karim with ৳1,000 outstanding and a ৳20 daily
> deduction.

---

## 1. Supervisor records the day

Sign in as **supervisor**.

**Attendance**

1. Find Abdul Karim's row.
2. The right-hand button **cycles** present → late → absent → leave. Press until
   it reads **present**. (Late also pays a full day; absent and leave do not, and
   a worker who is not present or late cannot be weighed in.)
3. Press **Save Attendance Data**. Nothing reaches the server until you do.

> Check: a confirmation appears and the row keeps its status after a refresh.

**Leaf Collection**

4. Press the weigh-in button.
5. Fill in **all three** required fields — the form refuses on any one of them:

   | Field | Value | If blank |
   |---|---|---|
   | CG id | `1` or `CG001` | "Enter the worker's CG id." |
   | Harvest weight | `30` | "Enter the harvest weight in kilograms." |
   | Quality grade | **A** | "Pick a quality grade." |

   Zone is optional.
6. Save. The modal closes only on success.

> Check: 30 kg against Abdul Karim appears in today's list.
>
> Worth saying aloud: 30 kg is 7 kg over the 23 kg quota, so ৳35 surplus, and
> grade A adds ৳1/kg = ৳30. With a ৳175 base that is **৳240 earned**.

---

## 2. Admin settles the day

Sign in as **admin** → **Payroll & Wage**.

7. The day's work is recorded but **not settled**. Settlement normally skips
   today, because leaf can still be weighed in — so press
   **Close today & settle**.
8. A card asks you to confirm. Read it out: tonight's automatic run will then
   find nothing to do, and if leaf arrives after this the day is corrected
   automatically.
9. Confirm.

> Check — the **What this run moved** panel, in taka:
>
> | To loan | To advance | To overdraw | Left payable |
> |---|---|---|---|
> | ৳20 | ৳0 | ৳0 | ৳220 |
>
> Those four add up to ৳240 — what he earned. **No cash moved here.** The loan
> balance fell 1,000 → 980; he is now *owed* ৳220.

**This is the moment to point at.** The deduction was not forecast, it was
recorded, and the four figures reconcile on screen.

---

## 3. The payslip

Still on Payroll.

10. **Daily Pay** tab → pick today. One row per worker: earned, loan taken,
    payable. This is the slip that matches how the estate actually works.
11. **Monthly Payslips** tab → Abdul Karim's row now shows a **loan deduction of
    ৳20**, not zero.

> Check: gross − deductions = net, and the net equals the payable from step 9.
>
> The payslip *describes* the settled days. It does not pay anybody.

**Where is the monthly payslip?** Payroll & Wage → **Monthly Payslips** tab
(second along; the first is Daily Pay). It covers the 1st to the last day of the
current month, one row per worker.

---

## 4. Worker takes his money

Sign in as **worker** → **বেতন ও ঋণ**.

12. **বেতন তুলুন** is now enabled — it was greyed out before settlement, because
    he was owed ৳0.
13. Ask for **৳100** and send.

> Check: the request appears as pending.

---

## 5. Admin approves, and cash moves

Back as **admin**.

14. Before approving, note **Finance → Cash on Hand**.
15. **Payroll → Withdrawals** tab → **Pay** on his row → **Approve & pay**.
16. Return to Finance.

> Check: **Cash on Hand fell by exactly ৳100.** Not ৳240, not ৳220 — only what
> he actually took.

This is the only step in the whole walkthrough where money leaves the estate.

---

## What you have just shown

| Step | What moved |
|---|---|
| Attendance + leaf | nothing — a record of work |
| Close today & settle | the **loan** balance, ৳20. No cash. |
| Generate payslips | nothing — a statement of the above |
| Worker withdraws, admin approves | **cash**, ৳100 |

If someone asks "where does the money actually move?", the answer is two
places: settlement moves debt, withdrawal moves cash. Everything else is a
record of one of those two.

---

## If something does not work

| Symptom | Cause |
|---|---|
| Weigh-in refuses "no worker with id 1 is marked present or late today" | the register was not saved, or he is absent/leave — step 2 |
| Deductions all ৳0 | no ACTIVE loan, or the day is not settled yet |
| **Apply to Pay Run** greyed out | unsettled work exists; use **Settle & generate** |
| বেতন তুলুন greyed out | owed ৳0 — settle a day first |
| Payslip net looks too high | generated before settling; press Settle & generate again |

---

## The same thing, automatically

```bash
cd backend
./mvnw test -Pselenium -Dselenium.slowMo=900
```

`T06_FieldToPayslipTest` is steps 1–3; `T05_WithdrawalMovesCashTest` is steps
4–5 and asserts the ledger delta. See `src/test/java/.../selenium/README.md`.
