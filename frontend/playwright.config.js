import { defineConfig, devices } from "@playwright/test";

// ============================================================================
// THIS IS A DEMONSTRATION SUITE, NOT A TEST SUITE
// ============================================================================
//
// It exists to prove five claims about Cha Ghor to somebody watching, in a
// browser they can see, in an order that reads like an agenda:
//
//   01  RBAC              a worker cannot reach the admin console OR its API
//   02  Password rules    weak passwords are rejected by the SERVER
//   03  Loan lifecycle    request -> approve -> deducted from daily settlement
//   04  Payroll + ledger  draft -> review -> approved -> paid, ledger follows
//   99  Rate limiting     the sixth login in a minute is refused with 429
//
// It asserts things we already believe, so it is weak as regression testing.
// Judge it as evidence, not as coverage.
//
// ============================================================================
// WHY workers:1 AND fullyParallel:false
// ============================================================================
//
// Two independent reasons, and both are hard requirements here.
//
// 1. A demonstration has to happen in ONE window, in ORDER. Playwright's
//    default is parallel across files, which for a viva means several browsers
//    racing and nothing to follow.
//
// 2. THE RATE LIMITER WOULD OTHERWISE SABOTAGE THE DEMO. LoginRateLimitFilter
//    allows MAX_ATTEMPTS = 5 per WINDOW_SECONDS = 60, keyed per client IP, on
//    /auth/login. Parallel specs all log in at once, blow the budget, and every
//    later scenario fails with 429 in front of the examiner -- looking exactly
//    like a broken application. Serial execution plus reusing a saved login
//    (see demo/global-setup.js) keeps the whole run inside the budget.
//
// The file names carry the order. Playwright sorts specs alphabetically, so
// 99-rate-limit runs LAST by construction: it deliberately exhausts the login
// budget, and anything after it would be locked out for a minute.
//
// The URLs come from env so a demo can point at a phone-visible LAN address
// instead of localhost without editing this file.
const BASE = process.env.DEMO_BASE_URL || "http://localhost:5173";

// Slow motion is the difference between a demo and a flicker.
//
// DERIVED FROM THE FLAGS, not from an env var. `DEMO_SLOWMO=400 playwright ...`
// would need cross-env to work on Windows, and a second devDependency to make
// a number slower is a poor trade. If a human asked for a visible browser
// (--headed or --ui) they want to watch it, so slow it down; a bare
// `playwright test` is headless and stays fast.
//
// DEMO_SLOWMO still overrides, for tuning the pace before a viva.
const WATCHING = process.argv.some((a) => a === "--headed" || a === "--ui");
const SLOW_MO = Number(process.env.DEMO_SLOWMO ?? (WATCHING ? 350 : 0));

export default defineConfig({
  testDir: "./demo",
  // A demo step can wait on a real backend doing real work (settlement over
  // every worker, payslip generation). The default 30s is tight for that.
  timeout: 90_000,
  expect: { timeout: 15_000 },

  fullyParallel: false,
  workers: 1,
  // No retries. A demo that quietly passes on the second attempt is lying
  // about what the examiner just watched fail.
  retries: 0,

  // The HTML report doubles as the appendix: a screenshot and a full trace for
  // every step, openable after the viva with `npx playwright show-report`.
  reporter: [
    ["list"],
    ["html", { outputFolder: "demo-report", open: "never" }],
  ],

  use: {
    baseURL: BASE,
    // Traces and screenshots ALWAYS, not just on failure -- the artefact is
    // the point here, and a passing run is the one worth keeping.
    trace: "on",
    screenshot: "on",
    video: process.env.DEMO_VIDEO ? "on" : "off",
    launchOptions: { slowMo: SLOW_MO },
  },

  // ==========================================================================
  // A SETUP PROJECT, NOT globalSetup. THIS ORDERING WAS A REAL BUG.
  // ==========================================================================
  //
  // globalSetup runs BEFORE Playwright starts `webServer`. The sign-in code
  // used to live there, so it opened http://localhost:5173/login while Vite
  // had not been launched yet, burned the full 30s navigation timeout and died
  // with a bare TimeoutError — "it opens Playwright and nothing happens".
  //
  // A setup project is an ordinary test file, so it runs AFTER webServer is up.
  // `dependencies` makes every scenario wait for it, and it appears as a real
  // step in --ui mode instead of failing invisibly before the runner draws.
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "demo",
      dependencies: ["setup"],
      // Only the numbered scenarios. Without this the setup file would also be
      // collected here and the logins would run twice — which on a 5-per-60s
      // budget is most of the way to throttling the demo.
      testMatch: /\d\d-.*\.spec\.js/,
      use: {
        ...devices["Desktop Chrome"],
        // Big enough to project, small enough that the admin tables do not
        // need horizontal scrolling on a lecture-room screen.
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  // Vite only. The BACKEND AND DATABASE ARE NOT STARTED HERE on purpose:
  // Spring Boot takes long enough that Playwright would time out, and a demo
  // should fail with "the backend is not running" rather than a browser
  // timeout that says nothing. demo/auth.setup.js checks for it and says so.
  //
  // reuseExistingServer means an already-running `npm run dev` is used as-is;
  // otherwise one is started and torn down with the run.
  webServer: process.env.DEMO_NO_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: BASE,
        reuseExistingServer: true,
        // Vite was measured at 14.8s cold on this machine; 60s is not generous.
        timeout: 120_000,
        stdout: "pipe",
      },
});
