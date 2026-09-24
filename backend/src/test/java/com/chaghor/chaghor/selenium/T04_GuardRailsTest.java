package com.chaghor.chaghor.selenium;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.WebElement;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

// ===========================================================================
// SCENARIO 4: the system refuses wrong actions, visibly.
// ===========================================================================
//
// Most tests prove a feature works. These prove the opposite thing -- that a
// dangerous action is not offered -- which is usually what an examiner probes
// and is almost never covered.
//
// WHAT IS PROVEN: the payslip state machine does not offer a stage-skip in the
// UI, and the pay-run button is not enabled while its precondition fails.
//
// WHAT IS NOT PROVEN: that the SERVER refuses. A UI that merely hides a button
// while the endpoint still accepts the request would pass every assertion here.
// PayrollService.transition() is what actually enforces the order, and proving
// that needs an API-level test. Do not describe this scenario as "the state
// machine is enforced" -- it shows the screen does not invite the mistake.
@Tag("selenium")
class T04_GuardRailsTest extends SeleniumTestBase {

    @Test
    @DisplayName("4a. A draft payslip is not offered a way to skip to Paid")
    void draftCannotJumpToPaid() {
        loginAsAdmin();
        driver.get(BASE_URL + "/admin/payroll");

        List<WebElement> rows = waitForRows(testId("payslip-row"), 10);
        skipUnless(!rows.isEmpty(),
                "No payslips for this period. Press Settle & generate first.");

        WebElement draft = rows.stream()
                .filter(r -> "draft".equalsIgnoreCase(String.valueOf(r.getDomAttribute("data-status"))))
                .findFirst()
                .orElse(null);

        skipUnless(draft != null,
                "No payslip is in Draft — this period has already been processed.");

        // The row's own action area must not contain a direct Pay control. The
        // lifecycle is draft -> review -> approved -> paid, one step at a time,
        // so the only action a draft should offer is the next one.
        String rowText = draft.getText().toLowerCase();
        boolean offersPay = rowText.contains("mark paid") || rowText.contains("pay now");

        assertTrue(!offersPay,
                "A Draft payslip is offering a direct Pay action. The lifecycle is "
                        + "draft -> review -> approved -> paid and no stage may be skipped.");
    }

    @Test
    @DisplayName("4b. A disabled control always explains itself")
    void disabledControlsSayWhy() {
        loginAsAdmin();
        driver.get(BASE_URL + "/admin/payroll");

        WebElement apply = waitFor(testId("apply-pay-run"));

        if (!apply.isEnabled()) {
            // A greyed button with no explanation is how an admin ends up
            // clicking it five times and then filing a bug. If we disable it,
            // the reason has to be reachable -- here, in the title attribute.
            String why = apply.getDomAttribute("title");
            assertTrue(why != null && !why.isBlank(),
                    "Apply to Pay Run is disabled but carries no explanation.");
            assertTrue(why.toLowerCase().contains("settle"),
                    "The explanation should name the fix (settle first). Got: " + why);
        }
    }

    @Test
    @DisplayName("4c. The bKash portal is labelled as a simulation")
    void bkashPortalDeclaresItselfSimulated() {
        loginAsAdmin();
        driver.get(BASE_URL + "/admin/bkash");

        // CLAUDE.md section 2: the SIMULATED framing must stay. No real bKash
        // API is called and the TrxIDs are SIM-prefixed, so a screen that looked
        // like a live payment portal would be the single most misleading thing
        // in the project -- particularly in front of an examiner.
        //
        // THIS TEST FOUND A REAL GAP. It first searched the page source for
        // "simulat" and timed out. The word WAS in the file -- but only inside
        // the pink portal, which renders under {batch && ...}. With no batch
        // built, the page showed a wallet balance and a list of workers owed
        // money with no disclaimer anywhere. A permanent notice was added; this
        // now asserts on that, by id rather than by prose so the wording stays
        // free to change.
        waitFor(testId("bkash-simulation-notice"));

        assertTrue(exists(testId("bkash-simulation-notice")),
                "The bKash page must say it is a simulation BEFORE any batch is "
                        + "built, not only inside the portal panel.");
    }
}
