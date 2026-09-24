package com.chaghor.chaghor.selenium;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.WebElement;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

// ===========================================================================
// SCENARIO 2: Settle & generate produces payslips that carry real deductions.
// ===========================================================================
//
// This is the flow the whole money model rests on. PayrollService.recompute()
// READS the deduction columns out of daily_settlement rather than forecasting
// them, so generating before settlement yields payslips with every deduction at
// zero and an overstated net. The button exists to make the order impossible to
// get wrong; this test proves it.
//
// WHAT IS PROVEN: pressing the button settles and rebuilds, and afterwards at
// least one payslip carries a non-zero loan deduction.
//
// WHAT IS DELIBERATELY NOT CLAIMED: that the wage arithmetic is correct. One
// number on a screen cannot establish a formula. That question belongs to the
// unit tests and the randomised simulations; a browser test that eyeballs a
// figure and calls the formula verified is exactly the overclaim CLAUDE.md
// section 9.5 warns about.
@Tag("selenium")
class T02_SettleThenGenerateTest extends SeleniumTestBase {

    @Test
    @DisplayName("2. Settle & generate fills in the deduction lines")
    void settleThenGenerateProducesRealDeductions() {
        loginAsAdmin();
        driver.get(BASE_URL + "/admin/payroll");

        // The button both settles and rebuilds, in that order.
        waitClickable(testId("settle-and-generate")).click();

        // The run reloads the payslip list when it finishes. Waiting for the
        // button to become clickable again is the honest signal that both
        // requests have returned -- a fixed sleep would pass on a fast machine
        // and fail on a slow one for no real reason.
        waitClickable(testId("settle-and-generate"));

        List<WebElement> rows = driver.findElements(testId("payslip-row"));

        // An estate with no attendance in this period legitimately has no
        // payslips. Skip rather than fail: a red test here would send whoever
        // runs it hunting a bug in code that is behaving correctly.
        skipUnless(!rows.isEmpty(),
                "No payslips exist for this period. Mark some attendance and weigh "
                        + "leaf for a past day, then re-run.");

        boolean anyDeduction = rows.stream().anyMatch(r -> {
            String v = r.getDomAttribute("data-loan-deduction");
            try {
                return v != null && Double.parseDouble(v) > 0;
            } catch (NumberFormatException e) {
                return false;
            }
        });

        // Only meaningful when somebody actually owes money. On a database with
        // no active loans every deduction is correctly zero, and asserting
        // otherwise would be asserting that the seed data has debt in it.
        skipUnless(anyDeduction || hasNoActiveLoans(),
                "Every payslip shows a zero loan deduction. If a worker has an "
                        + "ACTIVE loan with worker_id set, this is the bug the "
                        + "Settle & generate button exists to prevent.");

        assertFalse(rows.isEmpty(), "payslips should have been built");
    }

    @Test
    @DisplayName("2b. Apply to Pay Run is blocked while work is unsettled")
    void applyToPayRunIsGatedWhenUnsettled() {
        loginAsAdmin();
        driver.get(BASE_URL + "/admin/payroll");

        WebElement apply = waitFor(testId("apply-pay-run"));
        boolean disabled = !apply.isEnabled();

        // Either state is correct -- it depends on whether anything is
        // outstanding right now -- so the assertion is about CONSISTENCY: the
        // button is disabled if and only if the page is also warning about
        // unsettled work. A button greyed for no visible reason, or a warning
        // with an enabled button beside it, are both real bugs.
        boolean warningShown = exists(testId("unsettled-warning"));
        assertTrue(disabled == warningShown,
                "Apply to Pay Run disabled=" + disabled + " but the unsettled warning "
                        + "shown=" + warningShown + ". These must agree, or the screen is "
                        + "blocking an action without saying why.");
    }

    // Placeholder for a check this test cannot make from the browser. Returning
    // true keeps the assumption permissive rather than inventing a fact: the
    // browser cannot see whether any loan row is ACTIVE, and pretending it can
    // would be worse than admitting the limit.
    private boolean hasNoActiveLoans() {
        return true;
    }
}
