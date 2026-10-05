# Screenshot annotation prompts — Section 9 of the report

Ten prompts, one per figure. Give the **style block** once, then paste the
prompt for the screenshot you are annotating along with the image.

Every label below names a control that actually exists in the running system.
If a label does not appear in your screenshot, delete that callout rather than
letting the tool invent something — a diagram that names a button nobody can
find is worse than one callout fewer.

---

## The style block — send this first, every time

> You are annotating a screenshot for a university software engineering report.
>
> **Style rules, apply to every callout:**
> - Numbered circular badges (1, 2, 3 …) placed directly on the element, in solid
>   deep green `#14493B` with white bold numerals, about 28 px across.
> - A thin straight leader line from each badge to a short caption in the
>   margin — never across the middle of the interface.
> - Captions in a clean sans-serif (Inter, Helvetica or Arial), 14–16 px,
>   dark green `#14493B` on a pale `#F4FFE9` rounded label with a 1 px
>   `#14493B` border.
> - Where a caption warns about something, use amber `#FFF8E6` fill with a
>   `#B7791F` border instead.
> - Where a caption concerns money leaving the system, use `#E2136E` for the
>   badge.
> - Do not blur, crop, restyle, recolour or redraw any part of the underlying
>   screenshot. Add only the overlay.
> - Do not invent interface elements. If I describe something you cannot see in
>   the image, skip that callout and tell me which number you skipped.
> - Keep the original aspect ratio. Leave a 120 px margin on whichever side the
>   captions sit so nothing overlaps the interface.

---

## 9.1 — Login Screen

> Annotate this login screen with 4 callouts:
>
> 1. On the username field — "Username and password sign-in for administrators and supervisors"
> 2. On the password field — "Passwords are stored as BCrypt hashes, never in plain text"
> 3. On the Bangla / PIN tab or toggle — "Workers sign in with mobile number + 4-digit PIN. The number identifies, the PIN proves — 4 digits alone identify nobody"
> 4. On the submit button — "Attempts are rate limited per IP. Failures return a deliberately generic message so a valid username cannot be found by trial" *(amber)*

---

## 9.2 — Administrator Dashboard

> Annotate this dashboard with 5 callouts:
>
> 1. On the left sidebar — "Five admin features: Workforce, Payroll, Loans, Finance, Reports. bKash Payout sits beneath as a sub-part of Finance"
> 2. On the top KPI cards — "Live workforce and payroll indicators, computed from settled records rather than forecast"
> 3. On any alert chip or warning strip — "Items needing attention: unsettled work, payslips out of date, pending approvals" *(amber)*
> 4. On a chart — "Attendance and yield trends drawn from the estate's own recorded history"
> 5. On the notification bell — "Live over WebSocket — no polling"

---

## 9.3 — Payroll and Wage

> Annotate this payroll screen with 6 callouts:
>
> 1. On the tab row — "Four tabs: Daily Pay, Monthly Payslips, Withdrawals, SMS Log. Withdrawals and the delivery log live inside Payroll by design"
> 2. On the "Settle & generate" button — "Settles completed days, then rebuilds payslips — in that order, because payslips read recorded deductions"
> 3. On the "Close today & settle" button — "Today is normally excluded from settlement because leaf can still be weighed. This declares the day finished"
> 4. On the "Edit rates" control — "Base wage, leaf quota, surplus rate and grade-A bonus are runtime-configurable"
> 5. On any greyed-out "Apply to Pay Run" button or amber banner — "Blocked while unsettled work exists. The banner names how many days and the oldest date" *(amber)*
> 6. On the payslip table — "One row per worker for the period, showing gross, four deductions and net"

---

## 9.4 — Daily Settlement Result  ★ most important figure

**Where to find it:** Admin → **Payroll & Wage**. The panel does not exist until
you settle — press **Settle & generate** or **Close today & settle**, and it
appears directly beneath those buttons. Screenshot it immediately; navigating
away clears it.

> Annotate this settlement result panel with 6 callouts. This is the central
> claim of the whole system, so be precise. The exact on-screen labels are
> "What this run moved", "To loan repayment", "To advance recovery",
> "To overdraw recovery" and "Left payable to workers":
>
> 1. On the "What this run moved" heading — "Shown after every settlement run"
> 2. On "To loan repayment" — "Loan recovered from this day's earnings"
> 3. On "To advance recovery" — "Advance recovered"
> 4. On "To overdraw recovery" — "Recovery of a previous overpayment"
> 5. On "Left payable to workers" — "What the worker is now owed and may withdraw"
> 6. Draw a bracket or brace spanning all four figures with the caption:
>    "These four always sum to the amount earned. The deduction was RECORDED,
>    not forecast."
>
> Then add one amber callout pointing at the "Total earned over those days"
> line at the bottom of the panel, reading:
> "The system states this itself — no cash left the estate here. Settlement
> moves debt only; Cash on Hand in Finance is unchanged."
>
> Do not add a banner of your own invention. That sentence is already printed
> in the interface; the callout draws the eye to it.

## 9.5 — Supervisor Attendance Register

> Annotate this attendance register with 5 callouts:
>
> 1. On a worker's status button — "Cycles present → late → absent → leave. Late pays a full day"
> 2. On the "Save Attendance Data" button — "Nothing reaches the server until Save. The register is a local draft until then"
> 3. On any offline or queued indicator — "Works with no signal. Entries queue and replay on reconnection, each with a unique key so a retry cannot duplicate a day" *(amber)*
> 4. On the date selector — "One register per date; unique on worker and date"
> 5. On the AI or flags panel if visible — "Proxy-attendance flags: statistical patterns in the register. No model involved"

---

## 9.6 — Leaf Weigh-In

> Annotate this weigh-in form with 5 callouts:
>
> 1. On the CG id field — "Worker's estate identifier. Only workers marked present or late today can be weighed in"
> 2. On the weight field — "Kilograms plucked. Surplus above the 23 kg quota is measured per day, then summed"
> 3. On the quality grade selector — "Grade A carries a ৳1/kg bonus, so this field decides money"
> 4. On the photograph upload — "Optional. Image is downscaled to 768 px before it leaves the device"
> 5. On the suggested-grade text beside the grade field — "The model SUGGESTS. The field stays empty until a person chooses. It never pre-fills" *(amber — this is the key callout)*

---

## 9.7 — bKash Disbursement Portal

> Annotate this disbursement screen with 6 callouts:
>
> 1. On the SIMULATED banner — "Permanently displayed. No bKash API is called and every reference is SIM-prefixed" *(amber)*
> 2. On the wallet balance — "The estate's own money in a second pocket. Topping it up does NOT reduce Cash on Hand"
> 3. On the slip upload box — "Upload the payout slip the office downloaded when it approved these withdrawals"
> 4. On the matched rows list — "Each row matched on CG id AND mobile number. The amount comes from the database, never from the file"
> 5. On any skipped-rows warning — "Unmatched rows are reported with a reason, never silently dropped" *(amber)*
> 6. On the Send button — "THE ONLY STEP THAT MOVES CASH. Balance is checked before anyone is paid, so nobody is half-paid" *(pink `#E2136E` badge)*

---

## 9.8 — Worker Console, Wages

> Annotate this worker screen with 5 callouts. Note the interface is in Bangla —
> keep the captions in English but do not translate or alter anything on screen:
>
> 1. On the page heading (বেতন ও ঋণ) — "The worker console is entirely in Bangla, the language of its users"
> 2. On the daily ledger — "Day by day: what she picked, what she earned, what was deducted"
> 3. On the "বেতন তুলুন" button — "Withdraw wages. Disabled while she is owed ৳0 — it only becomes available after settlement"
> 4. On the "ঋণের আবেদন" button — "Request a loan. Never auto-approved; an administrator decides"
> 5. On any pay-change explanation panel — "Explains why this period differs from the last, component by component"

---

## 9.9 — Worker Payment Notification

> Annotate this notification card with 4 callouts:
>
> 1. On the টাকার খবর heading — "Money news — the estate telling this worker about her own pay"
> 2. On the message text — "Word for word what the SMS says, because the notification and the text are the same database row. They cannot disagree"
> 3. On the timestamp — "Updates live over WebSocket when a payment commits — no refresh needed"
> 4. On any 'ফোনে এসএমএস যায়নি' line — "Says plainly when SMS is switched off. A worker told 'we texted you' who got no text stops trusting the next message" *(amber)*

---

## 9.10 — Reports and Measured Model Accuracy

> Annotate this reports screen with 4 callouts:
>
> 1. On the export/PDF control — "Formatted PDF export; Reports owns the exported document"
> 2. On the model accuracy panel — "Measured accuracy shown per model, so any claim can be checked"
> 3. On the leaf grading figure — "56.7% against a 51% always-guess baseline, n = 97, p = 0.15. Statistically indistinguishable from guessing" *(amber)*
> 4. On the leaf health entry — "Not measured. No accuracy is claimed for it" *(amber)*

---

## After annotating

Check each image for three things before it goes in the report:

- **Do the numbers run in reading order** — top-left to bottom-right? A reader
  follows the badges, not your intent.
- **Is any caption covering an interface element** it is describing?
- **Does every caption describe something visible in that screenshot?** If the
  tool invented a control, delete the callout.

Place each finished image under its heading in Section 9 with the existing
caption (`Figure 7: Login Screen`, and so on) directly beneath it.
