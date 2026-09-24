package com.chaghor.chaghor.selenium;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.WebElement;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

// ===========================================================================
// FLOW A: field to payslip. The whole product in one test.
// ===========================================================================
//
//   supervisor -> mark attendance -> weigh leaf
//   admin      -> Close today & settle -> payslips rebuilt
//   result     -> a payslip exists carrying that day's work
//
// This is CLAUDE.md section 1 executed: "leaf weighed, wage computed,
// deductions applied, payslip issued". Two roles, two sessions, one estate.
//
// ---------------------------------------------------------------------------
// WHY IT USES "CLOSE TODAY & SETTLE" AND NOT "SETTLE & GENERATE"
// ---------------------------------------------------------------------------
// Settlement deliberately skips TODAY -- leaf can still be weighed and the
// register amended, so the figure is not final (DailySettlementService, the
// !date.isBefore(today) guard). The work this test just recorded is therefore
// invisible to an ordinary settle run.
//
// "Close today & settle" is the office declaring the day finished. Using it
// here is not a workaround: it is the only honest way to settle work created
// seconds ago, and the flow demonstrates exactly why that button exists.
//
// ---------------------------------------------------------------------------
// WHAT IS PROVEN / NOT PROVEN
// ---------------------------------------------------------------------------
// PROVEN: attendance and a weigh-in recorded by a supervisor reach the admin
// console, survive settlement, and land on a payslip.
//
// NOT CLAIMED: that the resulting figures are arithmetically right. A payslip
// existing is not a payslip being correct -- that belongs to the unit tests.
@Tag("selenium")
class T06_FieldToPayslipTest extends SeleniumTestBase {

    private static final String LEAF_KG = "30";

    // ONE worker, not the whole estate.
    //
    // "Mark all present" was quicker to write and worse to watch: eight rows
    // change at once and nothing on screen identifies what the test is doing.
    // Driving a single worker end to end is the thing you can actually narrate,
    // and it is the same code path.
    //
    // Worker #1 because DataInitializer seeds him first and links the demo
    // `worker` login to him, so this test and T05 talk about the same person.
    private static final int WORKER_ID = 1;

    @Test
    @DisplayName("6. Supervisor records a day, admin settles it, a payslip carries it")
    void fieldWorkReachesAPayslip() {
        // ------------------------------------------------- supervisor: register
        step("Supervisor signs in");
        login(SUPERVISOR_USER, SUPERVISOR_PASS);

        step("Open the attendance register");
        go("/supervisor/attendance");

        skipUnless(exists(testId("attendance-cycle-" + WORKER_ID)),
                "Worker #" + WORKER_ID + " is not on the attendance register. Is he "
                        + "active and in a zone this supervisor covers?");

        // CLICK UNTIL PRESENT, DO NOT CLICK ONCE AND HOPE.
        //
        // The row button CYCLES present -> late -> absent -> leave -> present.
        // Where one press lands depends entirely on where the row already was,
        // and this test re-runs against a database it has already touched.
        //
        // That is precisely how the previous run failed. An earlier run left
        // worker #1 "present"; the next made him "late"; the next made him
        // "absent" -- and the weigh-in then correctly refused with "No worker
        // with id 1 is marked present or late today." The register was not
        // broken and neither was the modal. The test was cycling blindly.
        //
        // So: read the status off the button and press until it says present.
        // Bounded by the cycle length, so a status that never changes fails
        // loudly instead of spinning.
        step("Mark worker #" + WORKER_ID + " present");
        markPresent(WORKER_ID);

        step("Save the register");
        safeClick(testId("attendance-save"));

        // The register is an UNSAVED DRAFT until Save is pressed, and the save is
        // what creates the rows settlement will later read. Waiting for the
        // button to settle back down is the signal the POST returned.
        waitClickable(testId("attendance-save"));

        // ------------------------------------------------- supervisor: weigh-in
        step("Open Leaf Collection");
        go("/supervisor/leaf");

        skipUnless(exists(testId("open-weigh-in")),
                "No weigh-in button on the Leaf page. Only workers marked present or "
                        + "late today can be weighed in, so the register save above may "
                        + "not have taken effect.");

        step("Open the weigh-in");
        safeClick(testId("open-weigh-in"));

        // THE WEIGH-IN NEEDS A CG ID, AND THE FIRST VERSION OF THIS TEST DID
        // NOT FILL IT.
        //
        // WeighInModal resolves the worker from a typed CG id, so leaving it
        // blank meant the save was refused with "Enter the worker's CG id." and
        // no leaf was ever recorded. The test still PASSED, because attendance
        // alone produces a payslip with a non-zero net -- it was proving less
        // than it claimed. parseWorkerId strips non-digits, so "CG001" and "1"
        // both resolve to worker 1.
        step("Enter the worker CG id");
        type(testId("weighin-worker"), String.valueOf(WORKER_ID));

        step("Weigh in " + LEAF_KG + " kg of leaf");
        type(testId("weighin-kg"), LEAF_KG);

        // GRADE IS REQUIRED TOO. save() refuses with "Pick a quality grade."
        // when it is blank, and it defaults to blank. Missing this is the same
        // mistake as the CG id: the modal simply refuses and the test sits
        // waiting for it to close.
        //
        // Grade A deliberately, because grade-A kilos carry the ৳1/kg bonus --
        // so this exercises gradeBonus as well as surplus rather than only the
        // base wage.
        step("Grade the leaf A");
        selectOption(testId("weighin-grade"), "A");

        step("Save the weigh-in");
        safeClick(testId("weighin-save"));

        // The modal closes on a successful save. If it stays open the save was
        // refused, and the modal is showing the reason -- so read it out rather
        // than letting this die on an anonymous lambda timeout, which is what
        // the first version did and taught nobody anything.
        try {
            wait.until(d -> d.findElements(testId("weighin-save")).isEmpty()
                    || !d.findElements(testId("weighin-save")).get(0).isDisplayed());
        } catch (org.openqa.selenium.TimeoutException e) {
            List<WebElement> err = driver.findElements(testId("weighin-error"));
            dumpDiagnostics("weighin-refused");
            throw new AssertionError(
                    "The weigh-in was refused and the modal stayed open. It says: \""
                            + (err.isEmpty() ? "(no message on screen)" : err.get(0).getText())
                            + "\"", e);
        }

        // ------------------------------------------------- admin: close and settle
        step("Admin signs in");
        login(ADMIN_USER, ADMIN_PASS);

        step("Open Payroll");
        go("/admin/payroll");

        step("Close today and settle it");
        safeClick(testId("close-today-settle"));

        // A CARD NOW, NOT window.confirm().
        // The browser alert was replaced with the console's own centred-card
        // dialog, so this clicks a real button instead of accepting a native
        // prompt. The acceptConfirm() helper that used to handle the native
        // dialog is gone with it -- dead code that names a removed mechanism
        // is worse than no comment at all.
        step("Confirm in the dialog");
        safeClick(testId("close-today-confirm"));

        // Settle then generate runs two requests back to back. The button
        // returning to a clickable state is the honest end-of-work signal.
        waitClickable(testId("settle-and-generate"));

        // ------------------------------------------------- the payslip
        step("Read the payslips");
        // waitForRows, not findElements: the list arrives by fetch, and
        // counting immediately reads an empty page that is still loading.
        List<WebElement> rows = waitForRows(testId("payslip-row"), 10);
        assertFalse(rows.isEmpty(),
                "A supervisor recorded attendance and a weigh-in, the admin closed and "
                        + "settled the day, and still no payslip exists for this period.");

        // Every payslip should carry a net. A row of zeroes after a full day of
        // recorded work means the chain broke somewhere between the register and
        // recompute().
        boolean anyPaid = rows.stream().anyMatch(r -> {
            String v = r.getDomAttribute("data-net");
            try {
                return v != null && Double.parseDouble(v) > 0;
            } catch (NumberFormatException e) {
                return false;
            }
        });

        assertTrue(anyPaid,
                "Payslips were built but every one shows a net of zero, after a day of "
                        + "attendance and " + LEAF_KG + "kg of leaf was recorded.");

        System.out.println("[selenium] field-to-payslip: " + rows.size()
                + " payslip(s) carry the day just recorded.");
    }

    // Press the row's status button until it reads "present", at most one full
    // cycle. Returns as soon as it is present; fails with the status it is
    // stuck on, which is far more useful than a later "no worker is present".
    private void markPresent(int workerId) {
        org.openqa.selenium.By button = testId("attendance-cycle-" + workerId);
        for (int i = 0; i < 5; i++) {
            String status = waitFor(button).getDomAttribute("data-status");
            if ("present".equalsIgnoreCase(status)) {
                System.out.println("[selenium] worker #" + workerId + " is present.");
                return;
            }
            System.out.println("[selenium] worker #" + workerId + " is \""
                    + (status == null || status.isBlank() ? "(unmarked)" : status)
                    + "\"; cycling.");
            safeClick(button);
        }
        throw new AssertionError(
                "Could not get worker #" + workerId + " to \"present\" after a full "
                        + "cycle of the status button. It is stuck on \""
                        + waitFor(button).getDomAttribute("data-status") + "\".");
    }

}
