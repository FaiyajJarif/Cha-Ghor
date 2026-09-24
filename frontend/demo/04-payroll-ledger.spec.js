import { test, expect } from "@playwright/test";
import { API, AUTH_FILE, apiLogin, auth, narrate, num, ready } from "./helpers.js";

// ============================================================================
// CLAIM 4: A payslip moves draft → review → approved → paid, no stage can be
//          skipped, and the ledger follows the money.
// ============================================================================
//
// CLAUDE.md §1: "If a taka moves, there must be a row for it." This scenario
// is that sentence, executed.
//
// ============================================================================
// WHAT IS ACTUALLY BEING PROVEN, AND WHAT IS NOT
// ============================================================================
//
// PROVEN: the state machine refuses to skip a stage, and cash-on-hand moves by
// the payslip's NET when it is paid.
//
// DELIBERATELY NOT CLAIMED: that the wage arithmetic is correct. That is a
// different question, better answered by the randomised simulations already in
// the project than by one payslip on screen. A demo that eyeballs one number
// and calls the formula verified is exactly the overclaim CLAUDE.md §9.5 warns
// about.
//
// NOTE ON DAILY SETTLEMENT: since the estate went daily, marking a payslip
// paid is a BOOKKEEPING status — wages reach workers as they withdraw, and
// only netPayable posts as cash out (§7.3). The Payroll screen says so itself.
// The scenario asserts the ledger delta, not that a worker was handed money.

test.describe("4. Payroll lifecycle and the ledger", () => {
  test("a payslip cannot skip a stage, and paying it posts to the ledger", async ({
    browser,
    request,
  }) => {
    const adminToken = await apiLogin(request, "admin");
    const H = { headers: auth(adminToken) };

    const context = await browser.newContext({ storageState: AUTH_FILE("admin") });
    const page = await context.newPage();

    // ---------------------------------------------------------------- step 1
    let slip;
    await test.step("generate this period's payslips", async () => {
      await page.goto("/admin/payroll");
      await ready(page);
      await narrate(page, "Admin console — Payroll.");

      const gen = await request.post(`${API}/payroll/generate`, {
        ...H,
        failOnStatusCode: false,
      });
      expect(gen.ok(), `generate failed: ${gen.status()} ${await gen.text()}`).toBeTruthy();

      // GET /payroll returns a plain List<PayrollResponse> — not a page.
      // Asserting the shape rather than guessing at .items/.content keeps this
      // honest: if the endpoint is ever paginated, this fails loudly instead of
      // silently finding nothing and skipping the scenario.
      const list = await request.get(`${API}/payroll`, H);
      expect(list.ok()).toBeTruthy();
      const all = await list.json();
      expect(Array.isArray(all), "GET /payroll should return an array").toBeTruthy();

      // Work on a DRAFT one. Re-running the demo must not depend on a clean
      // database — if every slip is already paid, say so instead of failing
      // with something cryptic in front of an audience.
      slip = all.find((r) => String(r.status).toLowerCase() === "draft");
      if (!slip) {
        test.skip(
          true,
          "No payslip is in Draft — this period has already been processed. " +
            "Reset with sql/dev_reset_seed.sql, or pick a fresh period, then re-run.",
        );
      }

      await page.reload();
      await ready(page);
      await narrate(page, `Payslip #${slip.id} — status DRAFT.`);
    });

    // ---------------------------------------------------------------- step 2
    await test.step("draft cannot jump straight to paid", async () => {
      const skipped = await request.post(`${API}/payroll/${slip.id}/pay`, {
        ...H,
        failOnStatusCode: false,
      });

      await narrate(
        page,
        `Tried DRAFT → PAID directly: the server answered ${skipped.status()} and refused.`,
        skipped.ok() ? "warn" : "pass",
      );

      expect(
        skipped.ok(),
        "a DRAFT payslip was paid without review or approval — the state machine is not guarding",
      ).toBeFalsy();

      test.info().annotations.push({
        type: "server said",
        description: (await skipped.text()).slice(0, 300),
      });
    });

    // ---------------------------------------------------------------- step 3
    let cashBefore;
    await test.step("walk it properly: review, then approve", async () => {
      const before = await request.get(`${API}/finance/summary`, H);
      expect(before.ok()).toBeTruthy();
      cashBefore = num((await before.json())?.cashOnHand);

      for (const stage of ["review", "approve"]) {
        const res = await request.post(`${API}/payroll/${slip.id}/${stage}`, {
          ...H,
          failOnStatusCode: false,
        });
        expect(
          res.ok(),
          `${stage} failed: ${res.status()} ${await res.text()}`,
        ).toBeTruthy();
        await page.reload();
        await ready(page);
        await narrate(page, `Payslip #${slip.id} → ${stage.toUpperCase()}D.`, "pass");
      }

      test.info().annotations.push({
        type: "cash on hand before paying",
        description: String(cashBefore),
      });
    });

    // ---------------------------------------------------------------- step 4
    await test.step("pay it, and show the ledger moved by exactly the NET", async () => {
      const paid = await request.post(`${API}/payroll/${slip.id}/pay`, {
        ...H,
        failOnStatusCode: false,
      });
      expect(paid.ok(), `pay failed: ${paid.status()} ${await paid.text()}`).toBeTruthy();

      const after = await request.get(`${API}/finance/summary`, H);
      const cashAfter = num((await after.json())?.cashOnHand);

      // Read the slip back for its authoritative net, rather than trusting the
      // copy captured before the transitions — recompute() can move figures.
      const list = await request.get(`${API}/payroll`, H);
      const all = await list.json();
      const fresh = all.find((r) => String(r.id) === String(slip.id)) || slip;
      const net = num(fresh.netPayable);

      await page.goto("/admin/finance");
      await ready(page);
      await narrate(
        page,
        `Paid. Cash on hand ${cashBefore} → ${cashAfter} (moved ${(cashBefore - cashAfter).toFixed(2)}). ` +
          `Payslip net was ${net}. Deductions never left the estate.`,
        "pass",
      );

      test.info().annotations.push({
        type: "ledger",
        description: `cashBefore=${cashBefore} cashAfter=${cashAfter} net=${net}`,
      });

      expect(String(fresh.status).toLowerCase(), "the payslip should now be paid").toBe("paid");

      // §7.3: ONLY netPayable posts as cash out. The deduction slices are
      // internal transfers and must not move cash on hand.
      //
      // Compared with a tolerance, not for equality: settlement may post
      // unrelated rows in the same window, and a demo that fails on a stray
      // paisa teaches the audience nothing. A whole-taka tolerance still
      // catches "the deductions were posted as cash too", which is the actual
      // failure mode being guarded.
      expect(
        Math.abs((cashBefore - cashAfter) - net),
        `cash moved by ${(cashBefore - cashAfter).toFixed(2)} but the payslip net was ${net}. ` +
          "Only netPayable should post as cash out.",
      ).toBeLessThanOrEqual(1);
    });

    await context.close();
  });
});
