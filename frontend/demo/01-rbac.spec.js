import { test, expect } from "@playwright/test";
import { API, AUTH_FILE, apiLogin, auth, narrate, ready } from "./helpers.js";

// ============================================================================
// CLAIM 1: A worker cannot reach the admin console, and cannot reach its API.
// ============================================================================
//
// BOTH HALVES MATTER, AND THE SECOND IS THE ONE THAT COUNTS.
//
// ProtectedRoute.jsx is client-side only — it reads user.role out of React
// context and renders <Navigate>. Showing only the redirect proves nothing an
// examiner would accept: it is JavaScript, and JavaScript in the browser
// belongs to the attacker. Anyone with DevTools can neutralise it.
//
// The control that actually holds is @PreAuthorize on the server. So this
// scenario shows the redirect (which is the honest user experience) and then
// immediately shows the worker's own token being refused by the API with a
// 403 — which is the part that survives the question "what if I bypass the
// frontend?".

test.describe("1. Role-based access control", () => {
  test("a worker is redirected away from the admin console", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE("worker") });
    const page = await context.newPage();

    await test.step("signed in as the worker", async () => {
      await page.goto("/worker");
      await ready(page);
      await narrate(page, "Signed in as: worker (role = worker)");
    });

    await test.step("typing the admin URL directly does not open it", async () => {
      await page.goto("/admin/payroll");
      await ready(page);
      // The guard sends a disallowed role to /dashboard.
      await expect(page).not.toHaveURL(/\/admin/);
      await narrate(
        page,
        "Typed /admin/payroll — the app refused and redirected. (Client-side guard)",
        "pass",
      );
    });

    await context.close();
  });

  test("the worker's own token is refused by the admin API with 403", async ({
    browser,
    request,
  }) => {
    const workerToken = await apiLogin(request, "worker");

    const context = await browser.newContext({ storageState: AUTH_FILE("worker") });
    const page = await context.newPage();
    await page.goto("/worker");
    await ready(page);

    await test.step("the same token that just worked, against an admin endpoint", async () => {
      // /admin/ping is @PreAuthorize("hasRole('ADMIN')") in MeController.
      // Chosen because it has no side effects — this proves authorisation,
      // not payroll behaviour.
      const own = await request.get(`${API}/me`, { headers: auth(workerToken) });
      expect(own.ok(), "the worker's token should work on their own data").toBeTruthy();

      const denied = await request.get(`${API}/admin/ping`, {
        headers: auth(workerToken),
        failOnStatusCode: false,
      });

      await narrate(
        page,
        `Same token: GET /me → ${own.status()} OK.  GET /admin/ping → ${denied.status()} FORBIDDEN. ` +
          "Enforced by Spring Security, not by the browser.",
        denied.status() === 403 ? "pass" : "warn",
      );

      expect(
        denied.status(),
        "an admin-only endpoint must refuse a worker token at the SERVER",
      ).toBe(403);
    });

    await context.close();
  });

  test("a supervisor is refused the admin-only endpoint too", async ({ request }) => {
    const supToken = await apiLogin(request, "supervisor");

    // Supervisors legitimately reach supervisor endpoints...
    const allowed = await request.get(`${API}/supervisor/ping`, {
      headers: auth(supToken),
      failOnStatusCode: false,
    });
    expect(allowed.status(), "supervisor should reach /supervisor/ping").toBe(200);

    // ...and are still not admins.
    const denied = await request.get(`${API}/admin/ping`, {
      headers: auth(supToken),
      failOnStatusCode: false,
    });
    expect(denied.status(), "supervisor must not reach an admin endpoint").toBe(403);
  });
});
