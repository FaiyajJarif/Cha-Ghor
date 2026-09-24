package com.chaghor.chaghor.selenium;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;

import static org.junit.jupiter.api.Assertions.assertTrue;

// ===========================================================================
// SCENARIO 3: a loan request is decided by a person, never automatically.
// ===========================================================================
//
// WHAT IS PROVEN: a PENDING loan sits waiting until an admin clicks Approve,
// and the pending count drops by one when they do.
//
// WHY NOT ALSO DRIVE THE WORKER SIDE: a worker can only reach the request form
// if workers.user_id links their record to a login, and on a fresh database
// only the seeded `worker` account is linked. A test that assumes more would
// fail on a clean clone for a reason that has nothing to do with loans. The
// request half is covered by the worker-scoped API tests instead.
//
// SELECTORS: this uses aria-label, not data-testid. The buttons already carry
// aria-label="Approve" and "Reject" because they are icon-only and need an
// accessible name. Selecting on that is better than adding a parallel test
// attribute -- it means the test breaks if the button stops being reachable to
// a screen reader, which is a failure worth hearing about.
@Tag("selenium")
class T03_LoanApprovalTest extends SeleniumTestBase {

    private static final By APPROVE = By.cssSelector("button[aria-label='Approve']");

    @Test
    @DisplayName("3. A pending loan is approved by a person, and leaves the queue")
    void adminApprovesAPendingLoan() {
        loginAsAdmin();
        driver.get(BASE_URL + "/admin/loans");

        // Let the table settle before counting. findElements returns instantly
        // with an empty list if the fetch has not landed, which would make an
        // unloaded page look like an empty queue.
        waitFor(By.tagName("table"));

        int before = waitForRows(APPROVE, 8).size();

        skipUnless(before > 0,
                "No loan is pending, so there is nothing to approve. Create a loan "
                        + "request first (or run sql/dev_reset_seed.sql), then re-run.");

        safeClick(APPROVE);

        // The row leaves the pending queue once the server answers. Waiting for
        // the count to fall is the real signal; a fixed sleep would be a guess.
        wait.until(d -> d.findElements(APPROVE).size() == before - 1);

        int after = driver.findElements(APPROVE).size();
        assertTrue(after == before - 1,
                "pending loans went from " + before + " to " + after
                        + "; approving should remove exactly one from the queue");
    }

    @Test
    @DisplayName("3b. Nothing approves itself — a pending loan stays pending")
    void loansAreNotAutoApproved() {
        loginAsAdmin();
        driver.get(BASE_URL + "/admin/loans");
        waitFor(By.tagName("table"));

        int first = waitForRows(APPROVE, 8).size();
        skipUnless(first > 0, "No pending loan to observe.");

        // Reload without touching anything. If a background job or an AI
        // assessment were deciding loans, the queue would shrink on its own --
        // and CLAUDE.md section 3 is explicit that a model advises and never
        // decides. This is the cheapest possible check of that rule.
        driver.navigate().refresh();
        waitFor(By.tagName("table"));

        int second = driver.findElements(APPROVE).size();
        assertTrue(second == first,
                "pending loans changed from " + first + " to " + second
                        + " with no human action. Something is deciding loans by itself.");
    }
}
