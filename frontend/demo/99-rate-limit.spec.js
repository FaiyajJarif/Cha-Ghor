import { test, expect } from "@playwright/test";
import { API, narrate } from "./helpers.js";

// ============================================================================
// CLAIM 5: Brute-forcing the login is refused.
// ============================================================================
//
// LoginRateLimitFilter: MAX_ATTEMPTS = 5 per WINDOW_SECONDS = 60, keyed per
// client IP, on /auth/login, /auth/login/pin and /auth/signup.
//
// ============================================================================
// THE FILE NUMBER IS LOAD-BEARING
// ============================================================================
//
// 99 puts this LAST. Playwright sorts spec files alphabetically and the config
// pins workers:1, so this runs after everything else — which it must, because
// it deliberately exhausts the login budget for the next 60 seconds. Placed
// earlier it would lock out every scenario that follows and the whole demo
// would collapse in front of the examiner, looking like a broken application
// rather than a working defence.
//
// If you ever add a 6th scenario, name it 05-something. Do not rename this.

test.describe("5. Login rate limiting", () => {
  test("the sixth wrong password in a minute is refused with 429", async ({
    page,
    request,
  }) => {
    // Deliberately wrong, and deliberately a REAL username: the limiter must
    // fire on attempt count, not on whether the account exists. A limiter that
    // only counted failures against unknown usernames would be trivially
    // bypassed by guessing against a known one.
    const attempt = () =>
      request.post(`${API}/auth/login`, {
        failOnStatusCode: false,
        data: { username: "admin", password: "definitely-not-the-password" },
      });

    await page.goto("/login");
    await narrate(page, "Brute-force attempt: repeated wrong passwords for a real account.");

    const codes = [];
    let limitedAt = -1;

    for (let i = 1; i <= 8; i += 1) {
      const res = await attempt();
      codes.push(res.status());
      if (res.status() === 429 && limitedAt < 0) {
        limitedAt = i;
        const retryAfter =
          res.headers()["retry-after"] ??
          (await res.json().catch(() => ({})))?.retryAfterSeconds;
        test.info().annotations.push({
          type: "throttled",
          description: `first 429 on attempt ${i}; Retry-After ${retryAfter ?? "(not sent)"}`,
        });
        break;
      }
    }

    await narrate(
      page,
      limitedAt > 0
        ? `Attempts ${codes.join(", ")} — refused with 429 on attempt ${limitedAt}. Further logins are locked for 60s.`
        : `Attempts ${codes.join(", ")} — NEVER throttled. The limiter is not doing its job.`,
      limitedAt > 0 ? "pass" : "warn",
    );

    expect(
      limitedAt,
      `eight wrong passwords were all accepted for processing (${codes.join(", ")}) — ` +
        "LoginRateLimitFilter is not throttling",
    ).toBeGreaterThan(0);

    // MAX_ATTEMPTS = 5 means attempts 1-5 pass through to authentication (and
    // fail on the password, 401) and the 6th is throttled. Asserted as a range
    // rather than exactly 6: the demo's own earlier logins share the same IP
    // bucket, so the block can legitimately arrive sooner.
    expect(
      limitedAt,
      "throttling arrived later than MAX_ATTEMPTS + 1 — the budget is larger than configured",
    ).toBeLessThanOrEqual(6);

    // Everything before the block should be an honest 401, not a 500.
    for (const c of codes.slice(0, limitedAt - 1)) {
      expect([401, 403], `unexpected status before throttling: ${c}`).toContain(c);
    }
  });

  test.afterAll(async () => {
    // Leave a note, not a 60-second sleep. Blocking the runner would make the
    // suite feel hung; the person re-running it needs to know why a fresh run
    // might fail in global-setup.
    // eslint-disable-next-line no-console
    console.log(
      "\n[demo] Login is now rate-limited for up to 60 seconds by design.\n" +
        "[demo] If you re-run immediately, global-setup may fail with 429. Wait a minute.\n",
    );
  });
});
