# Cha Ghor — presentation script

Roughly 12 minutes: 1 minute speaking, 9 clicking, 2 for questions.

---

## Before you start — the one decision that matters

**Demo on localhost, not on the deployed site.**

The Render deployment is real and you should show the URL. But `ai_service` is not
deployed and SMS cannot transmit from a Linux container, so on the public URL
every AI panel degrades and every message says `mock`. Locally, all thirteen AI
features work and the SMS log fills in.

So: run it locally, and end by opening the live URL on your phone. That way the
deployment is evidence of shipping rather than the thing you are demonstrating.

```bash
cd docker     && docker compose up -d
cd ai_service && source .venv/bin/activate && uvicorn main:app --port 8000 --reload
cd backend    && ./mvnw spring-boot:run
cd frontend   && npm run dev
```

Set up before the room fills:

- **Abdul Karim has an ACTIVE ৳1,000 loan at ৳20/day** — Loans & Advances. Pending
  deducts nothing, and the deduction column staying at ৳0 kills the best moment
  in the demo.
- **Three browser windows already logged in**: admin, supervisor, worker. Switching
  accounts live wastes forty seconds and breaks your rhythm.
- **A leaf photo on the desktop**, ready to drag into the weigh-in.
- **The deployed URL open on your phone**, already awake — the free instance takes
  3–4 minutes to start.

---

## The opening — say this, do not read it

> A woman picks forty kilos of tea leaf today. A supervisor writes it in a
> notebook. At the end of the month a clerk copies that notebook into a wage
> register.
>
> If the pen slips, she is paid for thirty. And she cannot prove it.
>
> That is what Cha Ghor is for. It is not a scheduling problem — it is a trust
> problem.
>
> So the system makes one promise: **if a taka moves, there is a row for it.**
> Leaf weighed, wage computed, deductions applied, payslip issued. Every number
> traces back to a field.
>
> Let me show you one worker, one day.

Then stop talking and start clicking. The demo is the argument.

---

## Act 1 — the field (supervisor) · 2 min

**Supervisor → Attendance**

1. Find Abdul Karim. Press his status button until it reads **present**.
2. Press **Save Attendance Data**.

> "Nothing reaches the server until Save. The register is a draft in his hand —
> a half-marked sheet must never be overwritten by a background refresh."

3. Point at the **AI panel** on this page.

> "These are proxy-attendance flags. Statistical patterns in the register —
> a supervisor marking a friend present. **No model involved.** Arithmetic."

**Supervisor → Leaf**

4. Open the weigh-in. Fill **all three** required fields: CG id `1`, weight `30`,
   grade **A**. Save.
5. If you have a photo, drag it in first and let the grader suggest.

> "It suggests a grade. It never fills the field. A person always chooses — and
> I will tell you exactly why in a moment."

**Say the arithmetic out loud:**

> "Thirty kilos, seven over the twenty-three kilo quota — ৳35 surplus. Grade A
> adds ৳1 a kilo, so ৳30. On a ৳175 base that is **৳240 earned**."

---

## Act 2 — the money (admin) · 3 min · THE CORE

**Admin → Payroll & Wage**

6. Press **Close today & settle**. Confirm in the card.

7. **Stop. Point at the "What this run moved" panel.** This is the best thirty
   seconds you have.

| To loan | To advance | To overdraw | Left payable |
|---|---|---|---|
| ৳20 | ৳0 | ৳0 | ৳220 |

> "Those four add up to ৳240 — exactly what he earned. The deduction was not
> forecast, it was recorded. And **no cash moved here.** His loan fell from
> ৳1,000 to ৳980. He is now owed ৳220."

8. Open **Finance** in another tab. Cash on Hand is **unchanged**.

> "Settlement moves debt. It never moves cash. Those are different things and
> the system refuses to confuse them."

9. Back to Payroll → **Monthly Payslips** → Abdul Karim's row now shows a **৳20
   loan deduction**, not zero.

> "The payslip describes the settled days. It does not pay anybody. The estate
> settles daily — the payslip is a statement."

**If they ask about guard rails**, show the gate: while unsettled work exists,
**Apply to Pay Run** is greyed out with an amber banner naming the fix. A system
refusing a wrong action is worth more than a system doing a right one.

---

## Act 3 — the worker and the money leaving · 2 min

**Worker window → বেতন ও ঋণ**

10. **বেতন তুলুন** is now enabled — it was greyed out before settlement, because
    he was owed ৳0. Request **৳100**.

**Admin → Payroll → Withdrawals**

11. **Approve** → a payout slip CSV downloads.

> "Approving does not pay. It writes a slip — the same spreadsheet an estate
> hands to whoever holds the bKash credentials."

12. **bKash Payout** → upload that slip → the run appears → **Send**.

13. **Finance** → Cash on Hand has fallen by **exactly ৳100**.

> "Not ৳240. Not ৳220. Only what he actually took. This is the one step in the
> whole system where money leaves the estate."

14. **Worker window → খবর ও নোটিশ** → the টাকার খবর card shows:
    *চা ঘর: আপনার বিকাশ নম্বরে ১০০ টাকা পাঠানো হয়েছে।*

> "Same wording the SMS carries, because the notification and the text are the
> same database row. They cannot tell him two different stories."

**The line to land:**

> "Two places money moves. Settlement moves debt. Withdrawal moves cash.
> Everything else is a record of one of those two."

---

## Act 4 — the AI, told honestly · 2 min

This is where most projects overclaim and get caught. Do the opposite.

**Admin → Reports & Analytics** — the model accuracy panel.

> "We built a model that grades leaf from a photograph. Then we did the thing
> that is easy to skip: we tested it. Ninety-seven labelled photographs from
> Sylhet. It was right **56.7%** of the time. Always guessing grade A would be
> right **51%**. p = 0.15.
>
> Grade A carries a one-taka-per-kilo bonus. So we had a choice: ship it, call
> it AI, and let it quietly decide what a worker earns — or write down what we
> measured.
>
> We wrote it down. It suggests. A person decides. It never pre-fills. We removed
> the confidence score, because a number that reads 0.96 whether it is right or
> wrong is decoration, not confidence.
>
> That is the most important feature in this project, and it is made of
> restraint."

**Then show what does work — Supervisor → Weather:**

> "The rain-impact factor is not from a textbook. It is a ratio computed from
> this estate's own records, replacing a constant somebody invented. No model.
> We call that data-driven calibration, because that is what it is."

**Supervisor → Fields** — the pluck advisor.

> "Arithmetic ranks the fields. The model writes the paragraph and is forbidden
> from changing the order."

**The chatbot** — bottom-right on any admin page. Ask it something real:

> *"Which workers have an active loan?"*

> "It queries five curated read-only views through a SQL guard. It never touches
> a base table."

---

## Act 5 — close · 1 min

15. **Open the deployed URL on your phone.** Add to Home Screen.

> "It is a progressive web app. It installs, and it works offline — a tea garden
> does not have wifi. A supervisor records a whole day with no signal and it
> queues. Every queued write carries a unique key, because a message sent twice
> must never pay a worker twice.
>
> The worker's app is entirely in Bangla. She signs in with her phone number and
> a four-digit PIN — an eight-character password with a symbol is fine in an
> office and a cruelty on a cheap Android keyboard in the rain.
>
> She can see what she picked, what she earned, what was taken, and why."

**Last line. Pause before it.**

> "The notebook is still there. It just isn't the only copy any more."

---

## Questions you should expect

**"Is the bKash integration real?"**
No. It is a simulation — every transaction id is `SIM`-prefixed and the portal is
labelled SIMULATED. The wallet arithmetic is real and feeds Finance. We did not
want a demo that looks like it moved somebody's money.

**"Why is the AI accuracy so low?"**
Because we measured it instead of assuming. Most projects this size never run the
evaluation. The number is in `ai_service/LEAF_GRADING_ACCURACY.md` with the sample
size and the p-value.

**"What does the leaf health detector score?"**
**We have not measured it.** That is the largest untested claim in the project and
we say so in our own documentation rather than letting you find it.

**"Does it handle a supervisor making a mistake?"**
Yes — editing attendance or leaf after settlement reverses the recovery, records
an overdraw, and re-settles. Money already recovered is never silently moved.

**"How many users can it take?"**
We have not load-tested it. Connection pool and statement timeouts are configured;
concurrency is unmeasured and we would not claim a number.

---

## If something breaks live

Do not debug in front of them. Say **"that one is deployed, let me show you the
part that matters"** and move on. You have four acts; losing one still leaves a
complete argument.

The single highest-value thirty seconds is **step 7** — four figures reconciling
to ৳240 on screen. If you only get one thing across, make it that one.
