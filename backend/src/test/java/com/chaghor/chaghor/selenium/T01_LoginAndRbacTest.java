package com.chaghor.chaghor.selenium;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.support.ui.ExpectedConditions;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

// ===========================================================================
// SCENARIO 1: authentication, and that a role cannot reach another role's
//             console by typing the URL.
// ===========================================================================
//
// WHAT IS PROVEN: the login form works for all three seeded roles, a wrong
// password is refused with a message, and a worker who types /admin does not
// get the admin console.
//
// WHAT IS NOT CLAIMED: that the API is secure. This drives the BROWSER, so it
// proves the UI does not expose the page. The server-side guard is a separate
// question, answered by @PreAuthorize and its own tests -- a route guard that
// merely hides a screen while the API still answers would pass this test and
// still be a hole. Do not let this scenario be described as "RBAC is secure".
@Tag("selenium")
class T01_LoginAndRbacTest extends SeleniumTestBase {

    @Test
    @DisplayName("1a. Admin signs in and lands on the admin console")
    void adminLogin() {
        login(ADMIN_USER, ADMIN_PASS);
        wait.until(ExpectedConditions.urlContains("/admin"));
        assertTrue(driver.getCurrentUrl().contains("/admin"),
                "admin should land on /admin, landed on " + driver.getCurrentUrl());
    }

    @Test
    @DisplayName("1b. Supervisor signs in and reaches the supervisor console")
    void supervisorLogin() {
        login(SUPERVISOR_USER, SUPERVISOR_PASS);
        // Not asserting an exact path: the app may route a supervisor to
        // /supervisor or via /dashboard. What matters is that sign-in succeeded
        // and we are no longer sitting on the login form.
        wait.until(ExpectedConditions.not(ExpectedConditions.urlContains("/login")));
        assertFalse(driver.getCurrentUrl().contains("/login"),
                "supervisor was left on the login page");
    }

    @Test
    @DisplayName("1c. A wrong password is refused, and says so")
    void wrongPasswordIsRefused() {
        login(ADMIN_USER, "definitely-not-the-password");

        // The message element, not the text: the wording is allowed to change
        // without breaking the test. Asserting on an English sentence would
        // also fail the moment this form is shown in Bangla.
        waitFor(testId("login-error"));
        assertTrue(driver.getCurrentUrl().contains("/login"),
                "a bad password should leave you on the login page");
    }

    @Test
    @DisplayName("1d. A worker typing /admin does not get the admin console")
    void workerCannotOpenAdminConsole() {
        login(WORKER_USER, WORKER_PASS);
        wait.until(ExpectedConditions.not(ExpectedConditions.urlContains("/login")));

        driver.get(BASE_URL + "/admin");

        // ProtectedRoute should bounce them. Give the redirect a moment, then
        // assert the admin-only furniture is absent rather than asserting a
        // particular destination -- the app is free to send them home or to
        // their own console, and both are correct.
        wait.until(d -> !d.getCurrentUrl().endsWith("/admin")
                || d.findElements(By.cssSelector("[data-testid='settle-and-generate']")).isEmpty());

        assertFalse(exists(testId("settle-and-generate")),
                "a worker reached a control that only an admin should see");
    }
}
