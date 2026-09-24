package com.chaghor.chaghor.selenium;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.WebElement;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

// ===========================================================================
// FLOW B: worker asks for their wages, admin approves, CASH ACTUALLY MOVES.
// ===========================================================================
//
// This is the one worth showing. Everything else in the system is bookkeeping;
// this is the moment taka leaves the estate, and it crosses two roles and two
// browser sessions to get there.
//
//   worker  ->  বেতন তুলুন  ->  amount  ->  আবেদন পাঠান
//   admin   ->  Payroll > Withdrawals  ->  Pay  ->  Approve & pay
//   ledger  ->  Cash on Hand falls by EXACTLY the amount requested
//
// WHY THE ASSERTION READS THE API, NOT THE SCREEN
//   The Finance card shows Cash on Hand through takaCompact(), which renders
//   121,540 as "1.2L". A delta asserted against that would pass while being
//   thousands out. Every ACTION here is performed by the browser; only the
//   MEASUREMENT comes from /finance/summary, which is the same endpoint the
//   card itself reads.
//
// WHAT IS PROVEN: the full request-approve-post path works end to end, and the
// ledger moves by exactly the requested amount -- not the gross, not the gross
// minus something. CLAUDE.md section 7 invariant 3: only netPayable posts as
// cash out, and it posts in WithdrawalService.
//
// WHAT IS NOT PROVEN: that the worker's balance was correctly computed in the
// first place. That is settlement's job and has its own coverage.
@Tag("selenium")
class T05_WithdrawalMovesCashTest extends SeleniumTestBase {

    // Small enough that a seeded worker can plausibly afford it, and a round
    // number so the delta is obvious to anyone watching the run.
    private static final int AMOUNT = 100;

    @Test
    @DisplayName("5. Worker withdraws, admin approves, and cash on hand falls by that amount")
    void withdrawalMovesCashOnHand() {
        String adminToken = apiToken(ADMIN_USER, ADMIN_PASS);
        double cashBefore = cashOnHand(adminToken);

        // ---------------------------------------------------------- worker
        step("Worker signs in");
        login(WORKER_USER, WORKER_PASS);

        step("Open বেতন ও ঋণ");
        go("/worker/wages");

        // A worker account that is not linked to a worker row cannot request
        // anything -- workers.user_id is what the console resolves through.
        // Skip with that explanation rather than fail on a missing button.
        skipUnless(exists(testId("worker-take-salary")),
                "The signed-in worker account is not linked to a worker record, so "
                        + "the বেতন তুলুন button is not shown. Link one in the admin "
                        + "console (Accounts > approve > pick a worker), then re-run.");

        // PRESENT BUT DISABLED IS A THIRD STATE, AND IT NEEDS ITS OWN MESSAGE.
        //
        // The first version only checked the button EXISTS, then clicked. With
        // a worker owed nothing the button renders greyed out, so the click
        // waited fifteen seconds and died on "element was not enabled" -- a
        // WebDriver sentence that says nothing about wages.
        //
        // A worker with a ৳0 payable being unable to withdraw is the system
        // working. The estate owes them nothing until a day is settled, and
        // offering the button would invite a request that must then be refused.
        // So: skip, and say which of the two situations it is.
        skipUnless(waitFor(testId("worker-take-salary")).isEnabled(),
                "বেতন তুলুন is disabled: this worker is owed ৳0 right now, so there is "
                        + "nothing to withdraw. That is correct behaviour, not a bug. "
                        + "Settle a day of their work first -- run T06, or press "
                        + "Payroll > Close today & settle -- then re-run.");

        step("Tap বেতন তুলুন");
        safeClick(testId("worker-take-salary"));

        step("Ask for " + AMOUNT + " taka");
        type(testId("take-money-amount"), String.valueOf(AMOUNT));

        WebElement send = waitFor(testId("take-money-submit"));
        // The modal disables the button when the amount exceeds what the worker
        // has earned. That is correct behaviour, not a failure of this test.
        skipUnless(send.isEnabled(),
                "The worker cannot withdraw ৳" + AMOUNT + " -- they have not earned that "
                        + "much yet. Settle a day of work first (Payroll > Close today & "
                        + "settle), then re-run.");

        step("Send the request");
        safeClick(testId("take-money-submit"));

        // ---------------------------------------------------------- admin
        step("Admin signs in");
        login(ADMIN_USER, ADMIN_PASS);

        step("Open Payroll, Withdrawals tab");
        go("/admin/payroll");
        clickTab("Withdrawals");
        pause();

        List<WebElement> pending = waitForRows(testId("withdrawal-pay"), 10);
        assertTrue(!pending.isEmpty(),
                "The worker submitted a withdrawal request but no pending row appeared "
                        + "in the admin Withdrawals tab.");
        int pendingBefore = pending.size();

        step("Approve the request");
        safeClick(testId("withdrawal-pay"));

        step("Confirm the payout");
        safeClick(testId("withdrawal-confirm"));

        // The row leaves the pending list once the server has posted the
        // payment. Waiting on that is the honest signal that the write
        // committed -- reading the ledger before it does would race.
        wait.until(d -> d.findElements(testId("withdrawal-pay")).size() == pendingBefore - 1);

        // ---------------------------------------------------------- ledger
        step("Read the ledger");
        double cashAfter = cashOnHand(adminToken);
        double moved = cashBefore - cashAfter;

        System.out.printf("[selenium] cash on hand %.2f -> %.2f (moved %.2f, requested %d)%n",
                cashBefore, cashAfter, moved, AMOUNT);

        // Whole-taka tolerance. Settlement or another process may post an
        // unrelated row in the same window, and a test that fails on a stray
        // paisa teaches whoever runs it to ignore red. A tolerance of 1 still
        // catches "the wrong amount was posted", which is the real failure.
        assertEquals(AMOUNT, moved, 1.0,
                "Cash on hand moved " + moved + " but the worker withdrew " + AMOUNT
                        + ". Only the requested amount should post as cash out.");
    }

    // The Payroll tabs are a shared FilterTabs component with no per-tab test
    // id, so this matches on the visible label. Safe here because the label is
    // also the thing a user reads -- if it changes, the demo script changes too.
    private void clickTab(String label) {
        WebElement tab = wait.until(d -> d.findElements(
                        org.openqa.selenium.By.tagName("button")).stream()
                .filter(b -> label.equalsIgnoreCase(b.getText().trim()))
                .findFirst().orElse(null));
        tab.click();
    }
}
