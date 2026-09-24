import { test, expect } from "@playwright/test";
import { API } from "./helpers.js";

// ============================================================================
// CLAIM 2: The SERVER enforces password strength, and privilege cannot be
//          requested at signup.
// ============================================================================
//
// These requests go straight to POST /auth/signup with no browser involved, so
// what is demonstrated is Bean Validation on SignupRequest — not a React form.
// The distinction is the whole point: form validation proves nothing, because
// the form is not what an attacker talks to.
//
// ============================================================================
// TWO THINGS THIS FILE HAD TO GET RIGHT
// ============================================================================
//
// 1. EVERY REQUIRED FIELD MUST BE VALID EXCEPT THE ONE UNDER TEST.
//    SignupRequest.fullName is @NotBlank. An earlier draft of this file omitted
//    it, so every request failed — but on the NAME, not the password. It would
//    have printed a confident green tick while proving nothing at all. Each
//    payload below is complete and legal apart from the single field being
//    demonstrated.
//
// 2. THE BUDGET. /auth/signup sits in LoginRateLimitFilter.LIMITED_PATHS with
//    MAX_ATTEMPTS = 5 per 60 seconds. Four requests are made here, leaving one
//    spare. Adding a fifth case would start starving the scenarios that follow.

const BASE_PAYLOAD = {
  fullName: "Demo Applicant",
  phone: "+8801712345678",
  role: "worker",
};

// A fresh identity per request, so a rejection can never be a duplicate
// username wearing a password error's clothes.
const unique = () => {
  const s = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  return { username: `demo_${s}`, email: `demo_${s}@example.invalid` };
};

const WEAK = [
  { pw: "12345678", why: "digits only — the string that passed the OLD rule" },
  { pw: "Password1", why: "no symbol" },
  { pw: "ALLCAPS1!", why: "no lower-case letter" },
];

test.describe("2. Password strength and privilege, enforced server-side", () => {
  for (const { pw, why } of WEAK) {
    test(`rejects "${pw}" — ${why}`, async ({ request }) => {
      const res = await request.post(`${API}/auth/signup`, {
        failOnStatusCode: false,
        data: { ...BASE_PAYLOAD, ...unique(), password: pw },
      });

      if (res.status() === 429) {
        test.skip(true, "Rate limited — signup shares the login budget. Re-run in a minute.");
      }

      const body = await res.text();
      test.info().annotations.push({
        type: "server said",
        description: body.slice(0, 400),
      });

      expect(
        res.status(),
        `"${pw}" was ACCEPTED — the password rule is not being enforced`,
      ).toBe(400);

      // Prove it failed on the password and not on some other field, which is
      // the mistake this file was originally written with.
      expect(
        body.toLowerCase(),
        "rejected, but not for the password — the demo would be proving the wrong thing",
      ).toContain("password");
    });
  }

  // The strongest single claim on this screen: the signup form is not an
  // admin-account vending machine. SignupRequest.role is a String, and the
  // service maps only "worker" and "supervisor" — so "admin" cannot be
  // deserialised into existence even before anyone reviews the queue.
  test("a signup asking for role=admin cannot create an admin", async ({ request }) => {
    const res = await request.post(`${API}/auth/signup`, {
      failOnStatusCode: false,
      data: {
        ...BASE_PAYLOAD,
        ...unique(),
        password: "Str0ng!Pass",  // deliberately VALID, so only the role is at issue
        role: "admin",
      },
    });

    if (res.status() === 429) {
      test.skip(true, "Rate limited — re-run in a minute.");
    }

    test.info().annotations.push({
      type: "server said",
      description: (await res.text()).slice(0, 400),
    });

    expect(
      res.status(),
      "a self-service signup was able to request the admin role",
    ).toBeGreaterThanOrEqual(400);
  });
});
