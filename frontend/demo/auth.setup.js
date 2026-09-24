import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { API, CREDS, AUTH_FILE } from "./helpers.js";

// Runs before every scenario, as a SETUP PROJECT.
//
// ============================================================================
// WHY THIS IS NOT globalSetup ANYMORE
// ============================================================================
//
// It was, and it did not work: `globalSetup` runs BEFORE Playwright starts the
// `webServer`. So this code opened http://localhost:5173/login while Vite had
// not been launched yet, waited the full 30s navigation timeout and failed
// with a bare TimeoutError — the exact symptom of "it opens Playwright and
// nothing happens".
//
// A setup PROJECT is an ordinary test file. Tests run after webServer is up and
// healthy, so the ordering problem cannot recur. It also shows as a real step
// in `--ui` mode, so if login ever breaks you can see where.
//
// ============================================================================
// WHY LOGGING IN ONCE MATTERS
// ============================================================================
//
// LoginRateLimitFilter: MAX_ATTEMPTS = 5 per WINDOW_SECONDS = 60, per IP, on
// /auth/login. Five scenarios logging in as two or three roles each would be
// a dozen attempts inside a minute — the demo would rate-limit ITSELF and look
// broken in front of the examiner.
//
// Three logins happen here, once. Everything after reuses the saved session.
// The only scenario that logs in repeatedly is 99-rate-limit, which is meant
// to, and runs last.
//
// The JWT lives in localStorage (AuthContext writes "token" and "user"), so
// storageState carries it.

setup("the backend is up", async ({ request }) => {
  let res;
  try {
    // /me with no token answers 401 and costs NO rate-limit attempt, unlike
    // hitting /auth/login to probe.
    res = await request.get(`${API}/me`, { failOnStatusCode: false });
  } catch {
    throw new Error(
      `\n\nThe backend is not reachable at ${API}.\n\n` +
        "Start it first, in two other terminals:\n" +
        "  cd docker  && docker compose up -d\n" +
        "  cd backend && ./mvnw spring-boot:run\n",
    );
  }
  expect(
    res.status(),
    `the backend answered ${res.status()} — it is running but unhealthy. ` +
      "Check its console for a Flyway or Hibernate error.",
  ).toBeLessThan(500);
});

for (const role of Object.keys(CREDS)) {
  setup(`sign in as ${role}`, async ({ page }) => {
    fs.mkdirSync(path.resolve("demo/.auth"), { recursive: true });

    // Through the REAL login form, not by injecting a token. If the login page
    // is broken the demo should fail here, loudly, before an audience.
    //
    // SELECTORS: the inputs carry no name and no id, and their labels are
    // <span> text that changes language. autocomplete is the only stable,
    // unique hook — and it exists ONLY in password mode, which makes it a mode
    // check as well as a selector.
    //
    // Plain /login is always password mode: Login.jsx derives `isWorker` from
    // ?role=worker, so with no query string mode starts "password" for every
    // role, including the worker.
    await page.goto("/login");

    const userBox = page.locator('input[autocomplete="username"]');
    if (!(await userBox.isVisible().catch(() => false))) {
      // Defensive: if the form somehow opened in PIN mode, the toggle at the
      // bottom switches it back. Cheaper than failing a live demo.
      await page
        .locator("button", { hasText: /password|পাসওয়ার্ড/i })
        .first()
        .click()
        .catch(() => {});
    }

    await userBox.fill(CREDS[role].username);
    await page
      .locator('input[autocomplete="current-password"]')
      .fill(CREDS[role].password);
    await page.locator('button[type="submit"]').click();

    // Waiting on the URL alone is a race — the redirect target differs by role.
    try {
      await page.waitForFunction(() => !!localStorage.getItem("token"), undefined, {
        timeout: 20_000,
      });
    } catch {
      const shown = await page.locator("body").innerText().catch(() => "");
      throw new Error(
        `\n\nCould not sign in as "${role}" through the UI.\n` +
          `The page said: ${shown.slice(0, 300)}\n\n` +
          "If that mentions wrong credentials, check DataInitializer seeded them " +
          "(admin/admin123, supervisor/super123, worker/worker123).\n" +
          "If it mentions too many attempts, the rate limiter is still inside its " +
          "60-second window — wait a minute and re-run.\n",
      );
    }

    await page.context().storageState({ path: AUTH_FILE(role) });
  });
}
