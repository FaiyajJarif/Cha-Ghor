# Cha Ghor — 10-minute video demo script

Team **Crimson Knights** · CSE 3422 / CSI 322 (C)

Every figure below is checked against the repo (`git shortlog`, the Selenium
`@DisplayName` strings, `LEAF_GRADING_ACCURACY.md`, `ai_service/dataset/`).
If it is on screen, it can be opened and verified.

| # | Section | Time |
|---|---|---|
| 1 | Introduction | 0:50 |
| 2 | Features | 6:45 |
| 3 | Git | 1:00 |
| 4 | Testing | 1:20 |
| | **Total** | **9:55** |

Record each section separately and cut them together.

---

## Before recording

- All four services up; database seeded (a payslip mid-pipeline, one pending
  loan, one pending withdrawal, a worker with an active loan).
- **Warm every AI panel once.** First call to a cold model can hit the timeout.
  This is the number-one cause of a demo failing on camera.
- Two windows side by side: admin left, supervisor/worker right.
- Browser at 110–125%. Console and bookmarks hidden.
- A **phone** (or DevTools device mode) ready for Act 1.

---

# 1 · Introduction — 0:50

**[SHOW]** Landing page, slow scroll. No clicks.

> Bangladesh has 167 tea estates; 135 are in greater Sylhet. Tea is one of the
> country's most important sectors — and it still runs on paper.
>
> A supervisor weighs each worker's leaf into a notebook. A clerk copies those
> notebooks into a wage register at month end. That one habit causes everything:
> wage disputes nobody can settle, advances paid twice, loans that never close,
> no idea what labour costs.
>
> Cha Ghor is an offline-first, Bangla-language tea estate management system
> that makes money traceable end to end — leaf weighed, wage computed,
> deductions recorded, payslip issued, ledger posted. The rule we built to:
> **if a taka moves, there is a row for it.**
>
> Thirteen modules, twelve AI endpoints, a worker console entirely in Bangla.

*~150 words, lands at 50s.*

---

# 2 · Features — 6:45

## Act 1 — Mobile, in the field, offline (1:05)

**Show this on an actual phone screen** (or DevTools mobile viewport). It is
your strongest opening and nobody else will have it.

**[SHOW]**

1. Phone → supervisor login → **Attendance**. Bottom tab bar, stacked cards.
2. Mark a few present, one late.
3. **DevTools → Network → Offline.** Say it out loud.
4. Mark two more, press **Save**. Point at the queued indicator.
5. **Back Online.** Queue drains, register intact.

> Supervisors work in the garden, where there is no signal. The whole console is
> a progressive web app — installable, and laid out for a phone: bottom tabs,
> stacked cards, no horizontal scrolling.
>
> Watch. I'll disconnect the network completely. It still saves. When the
> connection returns, the queue replays — and every queued write carries a
> unique key the server checks, so a retry cannot duplicate a worker's day.

## Act 2 — Fields and weather (0:50)

**[SHOW]**

1. Supervisor → **Fields**. The zone map, coloured by harvest progress. Add or
   rename a field.
2. Supervisor → **Weather**. Current readings, the 7-day outlook, the
   **AI weather briefing** panel in Bangla.
3. Point at the reading age ("updated N minutes ago").

> Fields and zones are managed on a map — workers and supervisors assigned per
> block, coloured by harvest progress.
>
> Weather refreshes on a schedule and feeds four downstream features. The
> briefing is generated in Bangla, for the supervisor.
>
> And one number here is ours, not a model's: the **rain-impact factor** in the
> yield forecast. It used to be an invented constant. We replaced it with a
> ratio of two means computed from the estate's own records — there is no model
> in it at all.

## Act 3 — Leaf, the dataset, and every AI feature (1:45)

**[SHOW]**

1. Supervisor → **Leaf collection**. Weigh in a worker.
2. Attach a photo. The AI **suggests** a grade.
3. **Point at the still-empty grade selector.** Choose it yourself.
4. Then the **Reports → model accuracy** panel.

> Grade A carries a one-taka-per-kilo bonus, so this field decides money.
>
> Our photo grader suggests a grade — and look, the field is still empty. It
> never pre-fills. A person chooses.
>
> Here is why. We prepared a dataset of **2,195 labelled photographs** — 1,167
> grade A, 1,028 grade B — from **Malnicherra Tea Garden in Sylhet, plus
> Sreemangal and Moulvibazar**. The region this system is built for.
>
> We then measured the grader on **97 held-out photographs: 56.7% correct,
> against a 51% always-guess baseline, p = 0.15.** Statistically that is
> indistinguishable from guessing. So the model suggests, a person decides, and
> we removed the confidence figure — it read 0.96 whether it was right or wrong.

**Then name the AI layer quickly over the Reports screen — twelve endpoints:**

| Group | Features |
|---|---|
| **Vision** (2) | leaf grade · leaf health / disease |
| **Advisory** (4) | pluck-round advisor · weather briefing · loan risk score · field case review |
| **Language** (5) | Cha Bot · SMS rewrite · loan note · report writer · worker-data extraction |
| **Statistical** (1) | proxy-attendance anomaly flags — *no model at all* |

> Twelve endpoints. Two of the strongest contain no model: the attendance flags
> and the rain factor are statistics computed from our own records. We call
> those data-driven calibration, because that is what they are.
>
> And one rule holds across all of them: **it advises, it never decides.**
> Nothing a model returns is written automatically to a grade, a wage or a
> status. Every call degrades — if the AI service is down, the page still works
> and says why.

## Act 4 — Daily settlement (1:15)

*If you cut anything, do not cut this.*

**[SHOW]** Admin → **Payroll & Wage** → **Settle & generate** → hold on the
**"What this run moved"** panel → open a payslip showing the four deductions.

> Most payroll systems settle monthly. We settle **daily**, and this panel is
> why that matters.
>
> Each completed day splits four ways: loan repayment, advance recovery,
> overdraw recovery, and what is left payable. Those four always sum to what was
> earned.
>
> And read what the system says itself — *no cash left the estate here.*
> Settlement moves debt, not money.
>
> So the payslip is a **statement**, not a payment. It reports deductions that
> were recorded day by day. It does not forecast them.

*The panel is transient — it clears when you navigate away. Screenshot it now.*

## Act 5 — One path for money (1:05)

**[SHOW]** Withdrawals → **Approve & make slip** (CSV downloads, nothing paid) →
**bKash Payout** (pink SIMULATED banner) → upload slip → **Send** → wallet drops
→ Finance ledger row → worker window shows the Bangla notice, live.

> Approving does **not** pay. It produces a payout slip.
>
> The admin uploads it here. This portal is a simulation — every reference is
> SIM-prefixed, no bKash API is called. The wallet balance is real and feeds
> Finance.
>
> **Send is the only action in the system that moves cash.** An earlier version
> also let you pay from the withdrawals tab — two ways to spend the same taka.
>
> And the slip chooses **who** is paid, never **how much**. Rows match on estate
> ID *and* mobile number; the amount is read from the database and the figure in
> the file is discarded. An edited slip can stop a payment. It cannot cause a
> wrong one, redirect it, or pay twice.
>
> There is the ledger row — and on her phone, in Bangla, over a WebSocket, she
> has already been told.

## Act 6 — The worker console: two taps, no reading (1:00)

*Do this on the phone. It is the most humane thing in the project and it is the
one an examiner is least likely to have seen before.*

**[SHOW]**

1. Worker console → the Bangla wages screen: day by day, picked, earned,
   deducted, loan balance.
2. → **Report a problem**. Six picture tiles, one Bangla word each.
3. **Tap a tile.** The phone speaks it aloud in Bangla. Let it be heard.
4. Confirm — two taps, filed.
5. **Record a voice note.** Speak a few words, stop.
6. Switch to the **admin window** → the case → **play the worker's recording
   back**.

> The worker console is entirely in Bangla. But literacy on a Sylhet estate is
> uneven — and that is not the same as being unable to reason. A plucker knows
> exactly what is wrong with her pay. What she cannot easily do is read six form
> labels and type two paragraphs on a phone keyboard, outdoors, after a shift.
>
> So we removed reading and typing rather than simplifying the words. Six
> pictures, one Bangla word each: low wage, danger, sick, broken tool, bad
> behaviour, something else.
>
> Tap one — [let it speak] — and the phone reads it back in Bangla, so someone
> who cannot read the word still knows what she chose before she confirms. Two
> taps from arriving to filed. The full form is still underneath for anyone who
> wants it.
>
> Priority is set by the category, not asked. "How urgent is it, on a scale of
> one to five" is a form question, not a human one. Injury and safety file as
> urgent because they are.
>
> And she can record her own account — up to two minutes — which the admin plays
> back as evidence on the case. Two different voices on this screen, and they
> are not the same feature: the app **speaking** is output, confirming what she
> chose; the worker **recording** is input, her own words.

**Say this exactly — it is the accurate version and it is stronger:**

> The speech is the browser's own Bangla voice, and the recording is raw audio
> the admin listens to. No model in either. The accessibility here is a design
> decision, not a model call — and it degrades honestly: if the device has no
> Bangla voice installed, the button simply does not appear rather than speaking
> gibberish.

---

# 3 · Git — 1:00

**[SHOW]** Run live in a terminal:

```bash
git shortlog -sne --all
git log --format="%ad" --date=format:"%Y-%m" | sort | uniq -c
```

> 122 commits, 6 August to 25 September — seven weeks.
>
> [name] led the money model and AI service, 84 commits. [name] and [name], 27
> each across backend modules and frontend. [name], 20.
>
> 84 commits in August built the core — workforce, attendance, leaf, payroll,
> the ledger. 38 in September: the supervisor console, the bKash payout flow,
> the AI service, and hardening.

**Two honest notes, both worth saying:**

- One member's commits land under **three identities** (`sazzadsazid`, `Sazzad`
  under two emails). Say so — it is a `.mailmap` away from fixed, and letting it
  look like three people is worse.
- **Commit count is not contribution.** One commit adds the 2,195-image dataset.
  Describe what people built.

*Fill in real names from the emails before recording.*

---

# 4 · Testing — 1:20

```bash
cd backend && ./mvnw test -Pselenium
```

Let the browser windows open on camera.

> These are end-to-end — a real Chrome against a running server and a real
> database, not mocks.

| Test | Proves |
|---|---|
| **T01** Admin signs in and lands on the admin console | Login + role-based routing |
| **T02** Settle & generate fills in the deduction lines | Generating before settling gives zero deductions — this catches it |
| **T03** A pending loan is approved by a person, and leaves the queue | Nothing is auto-approved |
| **T04** A draft payslip is not offered a way to skip to Paid | The state machine cannot be skipped |
| **T05** A withdrawal moves cash exactly once | The single money path holds |
| **T06** Field to payslip | One worker's leaf and attendance flow through to a payslip |

> T02 is the one worth explaining: payslips read deductions out of the
> settlement table, they do not forecast them. Generate before you settle and
> every deduction is zero with nothing on screen to explain it. This test fails
> if that ordering breaks.

**Record this separately if the run is at all fragile.** And do not say "all
tests pass" unless you have just watched them.

---

## Never say

| Don't | Do |
|---|---|
| "AI grades the leaf" | "AI *suggests*; a person decides" |
| "Our AI is 56.7% accurate" | "56.7% against a 51% baseline — not significantly better than guessing" |
| "We trained a model" | "We prepared a 2,195-image dataset and evaluated a vision model on 97 held-out photos" |
| "Thirteen AI features" | "Twelve endpoints; two more are pure statistics" |
| "It integrates with bKash" | "The portal is a simulation" |
| "The payslip pays the worker" | "She is paid daily; the payslip is a statement" |

## If you run over

Cut in this order: Act 2 weather half (25s) → Act 5 Finance check (15s) →
Act 3 AI table (read two groups, not four). Keep the tile-speaks moment in Act 6 —
it is four seconds and it is the one people remember.

**Never cut Act 4.**
