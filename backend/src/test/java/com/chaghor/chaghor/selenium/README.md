# Selenium browser tests — CSE-3412

Four scenarios driving a real Chrome against the running app.

| # | Scenario | What it proves |
|---|---|---|
| 01 | Login + RBAC | three roles sign in; a bad password is refused; a worker cannot open the admin console |
| 02 | Settle then generate | the button settles first, so payslips carry real deductions |
| 03 | Loan approval | a loan waits for a person; nothing approves itself |
| 04 | Guard rails | no stage-skip is offered; a disabled button explains itself; bKash says SIMULATED |

## Run it

**Three things must already be running.** Selenium does not start servers —
that is the difference from Playwright, and it is why the old Playwright attempt
died on a bare `TimeoutError`.

```bash
cd docker    && docker compose up -d      # terminal 1
cd backend   && ./mvnw spring-boot:run    # terminal 2
cd frontend  && npm run dev               # terminal 3
```

Then:

```bash
cd backend
./mvnw test -Pselenium          # Brave opens and drives itself
```

**Brave is the default browser**, because it is the one measured working on
this project's machine:

| Browser | Result |
|---|---|
| Brave | **4 of 4 green, ~18s** |
| Chrome | not installed here; should work, untested |
| Safari | **every login times out — see below** |

Other useful forms:

```bash
./mvnw test                                        # everything EXCEPT these; no browser needed
./mvnw test -Pselenium -Dselenium.headless=true    # CI, or over SSH
./mvnw test -Pselenium -Dtest=T01_LoginAndRbacTest # one scenario
./mvnw test -Pselenium -Dselenium.browser=safari   # run in Safari instead
```

## Safari does not work, and it is not the app

Measured on macOS 26.0.1 / Safari 26.0.1: **every login times out.** The same
build, selectors and credentials pass in Brave, and Safari is fine when a person
clicks the button.

The diagnostics rule out the obvious causes. Before the click both fields hold
the right values (`type()` verifies this by reading them back), and the submit
button is not disabled. After the click there is no redirect, no error element,
and **nothing in the page's network log** — so no request was ever attempted.
Safari's WebDriver click is not reaching React's `onSubmit`.

Use Brave. The Safari path is kept because it is worth retrying after a Safari
update, and because a measured "we tried it, here is what happened" is a better
answer in a viva than silence.

## Running in Safari anyway

Safari ships its own WebDriver at `/usr/bin/safaridriver` — nothing to
download, no version to keep in step with the browser. It has to be switched on
**once per machine**, by hand:

1. Safari → Settings → Advanced → tick **Show features for web developers**
   (older macOS calls it *Show Develop menu in menu bar*)
2. Develop → **Allow Remote Automation**
3. In a terminal, once: `safaridriver --enable` — answer the prompt

Then `./mvnw test -Pselenium -Dselenium.browser=safari`.

If it is not enabled, the tests fail with those three steps printed, not a
stack trace.

**Three Safari limits that are not bugs in this code:**

- **No headless mode.** Safari has none. `-Dselenium.headless=true` is ignored
  with a printed note and a window opens anyway. Fine for a demo, wrong for CI.
- **One session at a time.** Safari permits a single WebDriver session, so these
  tests can never run in parallel on it. The surefire profile pins `forkCount`
  to 1 — do not raise it.
- **Enabled by a person, not a script.** A fresh laptop or CI runner fails until
  someone does steps 1–3.

Chrome stays the default because it works on any machine with no setup. Use
Safari when you want the demo to run in the browser you actually use.

`SeleniumTestBase` checks the backend and Vite are answering before any browser
opens, and fails with the command to start whichever is missing.

## No driver setup

Selenium Manager (built in since 4.6) downloads a chromedriver matching your
installed Chrome. **Do not** add WebDriverManager and **do not** commit a
chromedriver binary — older tutorials say to, and both cause the version
mismatches they claim to fix. You need Chrome installed. That is all.

## Selectors

Tests select on `data-testid`, never on Tailwind classes. A class list is
styling: it changes the first time someone adjusts spacing, and the test then
fails for a reason unrelated to behaviour.

Current ids, all in `frontend/src`:

| testid | Where |
|---|---|
| `login-username`, `login-password`, `login-submit`, `login-error` | `pages/Login.jsx` |
| `settle-and-generate`, `apply-pay-run`, `unsettled-warning` | `pages/admin/Payroll.jsx` |
| `payslip-row` (+ `data-status`, `data-loan-deduction`, `data-net`) | `pages/admin/Payroll.jsx` |

Renaming one of these breaks a test. That is the point — it is a contract.

Scenario 03 uses `aria-label='Approve'` instead. Those buttons are icon-only and
already need an accessible name, so selecting on it means the test also fails if
the button stops being reachable to a screen reader.

## What these tests do NOT prove

Worth being straight about, because it is the kind of thing an examiner asks.

- **Not that the API is secure.** These drive the browser. Scenario 01 shows the
  UI does not expose the admin console to a worker; whether the *endpoint*
  refuses is a separate question answered by `@PreAuthorize`.
- **Not that the wage formula is correct.** One number on a screen cannot
  establish a formula. That belongs to unit tests and the randomised
  simulations.
- **Not that the payslip state machine is enforced.** Scenario 04 shows the
  screen does not offer a stage-skip. `PayrollService.transition()` is what
  actually refuses one.

## Tests skip rather than fail on missing data

Several scenarios call `Assumptions.assumeTrue`. If there is no pending loan or
no draft payslip, the test reports **skipped** with an explanation, not red.

A failure should mean the software is wrong. A test that goes red because the
database is empty teaches whoever runs it to ignore red, which is worse than
having no test.
