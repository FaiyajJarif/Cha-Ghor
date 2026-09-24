import { expect } from "@playwright/test";

// Shared plumbing for the demonstration suite.

export const API = process.env.DEMO_API_URL || "http://localhost:8080/api/v1";

export const CREDS = {
  // Seeded by DataInitializer.seed(). Documented in CLAUDE.md §5.
  admin: { username: "admin", password: "admin123" },
  supervisor: { username: "supervisor", password: "super123" },
  worker: { username: "worker", password: "worker123" },
};

export const AUTH_FILE = (role) => `demo/.auth/${role}.json`;

// ============================================================================
// narrate() -- the thing that makes this watchable
// ============================================================================
//
// Playwright's UI mode lists step names in a sidebar, which is fine when you
// are driving. In a viva the examiner is looking at the BROWSER, not at your
// second monitor. This paints the claim being proven straight onto the page,
// so the screenshot in the report and the projector both carry it.
//
// Injected rather than styled into the app: the demo must not require a single
// line of production code to exist for its benefit.
export async function narrate(page, text, tone = "info") {
  await page.evaluate(
    ({ text, tone }) => {
      const id = "cg-demo-banner";
      document.getElementById(id)?.remove();
      const bg =
        tone === "pass" ? "#14493B" : tone === "warn" ? "#8a1c1c" : "#1f2937";
      const el = document.createElement("div");
      el.id = id;
      el.textContent = text;
      el.style.cssText = [
        "position:fixed", "left:0", "right:0", "bottom:0", "z-index:2147483647",
        `background:${bg}`, "color:#fff", "font:600 15px/1.4 system-ui,sans-serif",
        "padding:12px 18px", "text-align:center", "pointer-events:none",
        "box-shadow:0 -2px 12px rgba(0,0,0,.25)",
      ].join(";");
      document.body.appendChild(el);
    },
    { text, tone },
  );
  // A beat, so a human eye can actually read it before the next action.
  await page.waitForTimeout(Number(process.env.DEMO_READ_MS || 900));
}

// Log in through the HTTP API and return the raw token.
//
// Used by global-setup and by the scenarios that need a SECOND identity's
// token without navigating (the RBAC proof needs a worker token while an admin
// page is on screen).
export async function apiLogin(request, role) {
  const res = await request.post(`${API}/auth/login`, { data: CREDS[role] });
  if (res.status() === 429) {
    throw new Error(
      "Login is rate limited right now (429). LoginRateLimitFilter allows 5 " +
        "attempts per 60s per IP. Wait a minute and run the demo again — this " +
        "usually means the previous run's rate-limit scenario is still inside " +
        "its window.",
    );
  }
  expect(res.ok(), `login as ${role} failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).token;
}

// Authorised request headers for a role's token.
export const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Money strings out of the API come back as numbers or numeric strings; the UI
// renders them with separators and a ৳. Compare on the number.
export const num = (v) => Number(String(v ?? 0).replace(/[^0-9.-]/g, ""));

// Wait for the app to have finished its initial fetches. Every console renders
// a shell first, so asserting on text immediately is a race.
export async function ready(page) {
  await page.waitForLoadState("networkidle");
}
