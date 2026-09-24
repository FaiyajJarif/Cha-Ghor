package com.chaghor.chaghor.selenium;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.openqa.selenium.By;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.ElementClickInterceptedException;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebDriverException;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.safari.SafariDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.net.HttpURLConnection;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.fail;

// ===========================================================================
// Shared setup for every Selenium test. CSE-3412 browser testing.
// ===========================================================================
//
// WHAT SELENIUM IS DOING HERE
//   This JUnit process speaks the W3C WebDriver protocol to a chromedriver
//   process, which drives a real Chrome window against the running app:
//
//       JUnit  ->  chromedriver  ->  Chrome  ->  http://localhost:5173
//
//   Nothing is mocked. The browser logs in, clicks buttons and reads the DOM
//   exactly as a person would, and the backend and database underneath are the
//   real ones.
//
// SELENIUM DOES NOT START YOUR SERVERS
//   Playwright has a `webServer` option; Selenium has no equivalent. Postgres,
//   the backend and Vite must already be running. The preflight below checks
//   that and fails with a sentence you can act on, because the default failure
//   is a bare 30-second timeout that says nothing about which service is down.
//   That exact confusion already cost this project one debugging session.
//
// NO MANUAL DRIVER SETUP
//   Selenium Manager (built in since 4.6) downloads a chromedriver matching the
//   installed Chrome. Do not add WebDriverManager and do not commit a driver
//   binary; older tutorials tell you to and it causes the version mismatches it
//   is supposed to prevent.
@Tag("selenium")
public abstract class SeleniumTestBase {

    // Overridable so the suite can run against a phone-visible LAN address or a
    // different port without editing code.
    protected static final String BASE_URL =
            System.getProperty("selenium.baseUrl", "http://localhost:5173");
    protected static final String API_URL =
            System.getProperty("selenium.apiUrl", "http://localhost:8080");

    // Visible by default: the point of these tests, for a demo, is watching the
    // browser drive itself. -Dselenium.headless=true for CI or over SSH.
    private static final boolean HEADLESS =
            Boolean.parseBoolean(System.getProperty("selenium.headless", "false"));

    protected WebDriver driver;
    protected WebDriverWait wait;

    // Seeded accounts. Documented in CLAUDE.md section 5; not secrets.
    protected static final String ADMIN_USER = "admin";
    protected static final String ADMIN_PASS = "admin123";
    protected static final String SUPERVISOR_USER = "supervisor";
    protected static final String SUPERVISOR_PASS = "super123";
    protected static final String WORKER_USER = "worker";
    protected static final String WORKER_PASS = "worker123";

    // Progress lines, because a silent hang is unreadable.
    //
    // A run that stops on "Running T01..." with NOTHING after it gives you no
    // way to tell whether it is checking the backend, downloading a driver, or
    // waiting on a browser that will never appear. Each stage now announces
    // itself, so the last line printed is the stage that is stuck.
    @BeforeAll
    static void preflight() {
        System.out.println("[selenium] checking the backend and frontend are up...");
        requireUp(API_URL + "/api/v1/auth/login", "backend",
                "cd backend && ./mvnw spring-boot:run");
        requireUp(BASE_URL, "frontend (Vite)", "cd frontend && npm run dev");
        System.out.println("[selenium] both are answering.");
    }

    // A HEAD/GET that reaches the port at all is enough. We are not asserting a
    // 200: /auth/login answers 405 to a GET, and treating that as "down" would
    // be a false alarm on a perfectly healthy backend.
    private static void requireUp(String url, String what, String howToStart) {
        try {
            HttpURLConnection c = (HttpURLConnection) URI.create(url).toURL().openConnection();
            c.setConnectTimeout(3000);
            c.setReadTimeout(3000);
            c.setRequestMethod("GET");
            c.getResponseCode();
            c.disconnect();
        } catch (Exception e) {
            fail("The " + what + " is not answering at " + url + ".\n"
                    + "Selenium does not start it for you. In another terminal:\n"
                    + "    " + howToStart + "\n"
                    + "Then re-run: ./mvnw test -Pselenium");
        }
    }

    // brave (default) | chrome | safari.   -Dselenium.browser=chrome
    //
    // BRAVE IS THE DEFAULT, MEASURED RATHER THAN ASSUMED.
    // It runs all four scenarios green in ~18s on this project's machine.
    // Chrome is not installed there, and Safari does not work -- see newSafari.
    private static final String BROWSER =
            System.getProperty("selenium.browser", "brave").toLowerCase();

    // Brave is Chromium, so chromedriver drives it -- it just has to be told
    // where the binary is, because Selenium Manager looks for Chrome.
    // Overridable for a non-standard install path.
    private static final String BRAVE_BINARY = System.getProperty(
            "selenium.braveBinary",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser");

    @BeforeEach
    void openBrowser() {
        System.out.println("[selenium] starting " + BROWSER
                + " (Selenium Manager may download a driver on first use)...");
        driver = switch (BROWSER) {
            case "safari" -> newSafari();
            case "brave" -> newBrave();
            default -> newChrome();
        };

        // Set through the WebDriver API rather than a launch flag, because
        // Safari has no equivalent of --window-size. A fixed size keeps the
        // tests off the MOBILE layout: below md the admin console swaps its
        // sidebar for a bottom tab bar, so the links these tests click do not
        // exist and every failure reads as "no such element" -- a broken
        // selector, apparently, rather than a too-narrow window.
        driver.manage().window().setSize(new Dimension(1440, 900));

        wait = new WebDriverWait(driver, Duration.ofSeconds(15));
        System.out.println("[selenium] browser ready.");
    }

    private WebDriver newChrome() {
        return new ChromeDriver(chromeOptions());
    }

    // ========================================================================
    // BRAVE. Chromium underneath, so chromedriver drives it unchanged.
    // ========================================================================
    // The ONLY difference from Chrome is setBinary: Selenium Manager downloads
    // a chromedriver and then looks for Google Chrome, which is not installed
    // here. Pointing it at Brave is the whole trick.
    //
    // Brave also ships Shields, which blocks scripts and storage far more
    // aggressively than Chrome by default. On localhost that is normally fine,
    // but if a test fails here and passes in Safari, check Shields before
    // suspecting the app.
    //
    // Unlike Safari this DOES support headless, so it is the better choice for
    // a CI run on a machine with no Chrome.
    private WebDriver newBrave() {
        ChromeOptions options = chromeOptions();
        options.setBinary(BRAVE_BINARY);
        try {
            return new ChromeDriver(options);
        } catch (WebDriverException e) {
            fail("Could not start Brave via chromedriver.\n"
                    + "Looked for the binary at:\n  " + BRAVE_BINARY + "\n"
                    + "If Brave is installed elsewhere, pass the real path:\n"
                    + "  ./mvnw test -Pselenium -Dselenium.browser=brave \\\n"
                    + "      -Dselenium.braveBinary=\"/path/to/Brave Browser\"\n"
                    + "Original error: " + e.getMessage());
            return null;   // unreachable; fail() throws
        }
    }

    private ChromeOptions chromeOptions() {
        ChromeOptions options = new ChromeOptions();
        if (HEADLESS) {
            options.addArguments("--headless=new");
        }
        options.addArguments("--remote-allow-origins=*");
        return options;
    }

    // ========================================================================
    // SAFARI. Built into macOS, but it needs turning on ONCE, by hand.
    // ========================================================================
    //
    //   1. Safari > Settings > Advanced > tick "Show features for web
    //      developers" (older macOS calls it "Show Develop menu in menu bar").
    //   2. Develop > Allow Remote Automation.
    //   3. In a terminal, once:   safaridriver --enable
    //      and answer the authentication prompt it raises.
    //
    // The driver is already on the machine at /usr/bin/safaridriver, bundled
    // with Safari since version 10. There is nothing to download and no version
    // to keep in step, which is the one way Safari is easier than Chrome here.
    //
    // THREE LIMITS THAT ARE NOT BUGS IN THIS CODE:
    //
    //   * NO HEADLESS MODE. Safari has none. -Dselenium.headless=true is
    //     ignored here rather than silently pretending to work, and a browser
    //     window WILL open. That is fine for a demo and wrong for CI.
    //   * ONE SESSION AT A TIME. Safari allows a single WebDriver session per
    //     browser instance, so these tests can never run in parallel on Safari.
    //     The surefire profile already pins forkCount to 1; do not raise it.
    //   * Automation is enabled per-machine by a human, so a fresh laptop or a
    //     CI runner will fail until someone does steps 1 to 3 above. The catch
    //     below turns the resulting SessionNotCreatedException into those
    //     instructions instead of a stack trace.
    //
    // ========================================================================
    // KNOWN: THESE TESTS DO NOT PASS IN SAFARI. USE BRAVE.
    // ========================================================================
    // Measured on macOS 26.0.1 / Safari 26.0.1, Selenium 4.x:
    //
    //   Brave  : 4 of 4 green, ~18s
    //   Safari : every login times out
    //
    // The diagnostics rule out the obvious suspects. Both fields hold the
    // right values before the click (type() verifies it), the submit button is
    // not disabled, and afterwards there is no redirect, no error element, and
    // nothing in the page network log. So Safari's click on the submit button
    // is not reaching the React onSubmit handler -- the form never submits.
    //
    // This is a Safari WebDriver limitation, NOT a bug in the app: the same
    // build, the same selectors and the same credentials pass in Brave, and
    // Safari works fine when a person clicks the button.
    //
    // Left in rather than deleted because it is worth re-testing after a Safari
    // update, and because "we tried it, here is what we measured" is a better
    // answer than silence. If you want it working, the next thing to try is
    // submitting the form directly (form.requestSubmit()) rather than clicking
    // -- but that would stop the test exercising the click a real user makes,
    // so it is a downgrade, not a fix.
    private WebDriver newSafari() {
        if (HEADLESS) {
            System.out.println(
                    "[selenium] -Dselenium.headless=true was ignored: Safari has no "
                            + "headless mode. Use Chrome for a headless run.");
        }
        try {
            return new SafariDriver();
        // WebDriverException ALONE, not a multi-catch with
        // SessionNotCreatedException: the latter EXTENDS the former, and Java
        // rejects multi-catch alternatives related by subclassing. Catching the
        // parent already covers the session failure, which is the case this
        // handler exists for.
        } catch (WebDriverException e) {
            fail("Safari refused to start a WebDriver session.\n"
                    + "Enable automation once, then re-run:\n"
                    + "  1. Safari > Settings > Advanced > Show features for web developers\n"
                    + "  2. Develop > Allow Remote Automation\n"
                    + "  3. safaridriver --enable      (answer the prompt)\n"
                    + "Also close any other Safari automation session: Safari permits "
                    + "only one at a time.\n"
                    + "Original error: " + e.getMessage());
            return null;   // unreachable; fail() throws
        }
    }

    @AfterEach
    void closeBrowser() {
        if (driver != null) {
            driver.quit();
        }
    }

    // ---- helpers ----------------------------------------------------------

    // Selectors go through data-testid, never through Tailwind classes. A class
    // list is styling: it changes the first time someone adjusts spacing, and
    // the test then fails for a reason that has nothing to do with behaviour.
    protected By testId(String id) {
        return By.cssSelector("[data-testid='" + id + "']");
    }

    protected WebElement waitFor(By locator) {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    protected WebElement waitClickable(By locator) {
        return wait.until(ExpectedConditions.elementToBeClickable(locator));
    }

    // ========================================================================
    // WATCHING THE RUN: slow motion and on-screen narration.
    // ========================================================================
    //
    //   ./mvnw test -Pselenium -Dselenium.slowMo=900
    //
    // Milliseconds to pause after every click, every keystroke batch and every
    // navigation. 0 by default, so a normal or CI run is not slowed down by a
    // demo setting someone forgot to remove.
    //
    // 700-1000ms is about right for narrating to a room. Above ~1500 the run
    // starts to feel broken rather than deliberate.
    private static final long SLOW_MO =
            Long.parseLong(System.getProperty("selenium.slowMo", "0"));

    private int stepNo = 0;

    // Announce what is about to happen, in the console AND on the page.
    //
    // The console line is for the log afterwards; the on-screen banner is for
    // whoever is watching, who cannot see the terminal and otherwise has to
    // guess why the browser just did something. It is injected rather than
    // built into the app, so nothing about the shipped UI changes.
    protected void step(String what) {
        stepNo++;
        System.out.println("[selenium] STEP " + stepNo + ": " + what);
        banner("STEP " + stepNo + " — " + what);
        pause();
    }

    private void banner(String text) {
        try {
            ((JavascriptExecutor) driver).executeScript(
                    "let b = document.getElementById('__cg_step');"
                            + "if (!b) {"
                            + "  b = document.createElement('div');"
                            + "  b.id = '__cg_step';"
                            + "  b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;"
                            + "background:#14493B;color:#C0F28B;font:600 15px/1.5 system-ui,sans-serif;"
                            + "padding:10px 16px;box-shadow:0 2px 12px rgba(0,0,0,.35);pointer-events:none';"
                            + "  document.body.appendChild(b);"
                            + "}"
                            + "b.textContent = arguments[0];",
                    text);
        } catch (Exception ignored) {
            // A banner is a convenience. Never let it fail a test -- the page
            // may be mid-navigation with no body yet, which is harmless.
        }
    }

    // Applied after actions, not before assertions: the point is to let a
    // watcher SEE the result of what just happened.
    protected void pause() {
        if (SLOW_MO <= 0) {
            return;
        }
        try {
            Thread.sleep(SLOW_MO);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // Navigate, re-announce the current step on the new page, and pause.
    // driver.get() wipes the injected banner, so it has to be put back.
    protected void go(String path) {
        driver.get(BASE_URL + path);
        if (stepNo > 0) {
            banner("STEP " + stepNo + " — " + path);
        }
        pause();
    }

    // ========================================================================
    // WAIT FOR A LIST TO ARRIVE BEFORE CONCLUDING IT IS EMPTY.
    // ========================================================================
    //
    // findElements() returns instantly with an empty list when the fetch has
    // not landed yet, so a test that navigates and counts immediately reads
    // "no rows" from a page that is still loading. That is exactly what
    // happened on the last run: T02 pressed a button first (which gave the
    // fetch time) and saw payslips; T04 navigated and counted at once, and
    // reported "No payslips for this period" on the same database seconds
    // later. The data was there. The test was early.
    //
    // This waits up to `seconds` for at least one row and then gives up
    // QUIETLY -- genuinely empty is a legitimate outcome that the caller
    // handles with skipUnless. It only removes the race.
    protected List<WebElement> waitForRows(By rowLocator, int seconds) {
        try {
            new WebDriverWait(driver, Duration.ofSeconds(seconds))
                    .until(ExpectedConditions.numberOfElementsToBeMoreThan(rowLocator, 0));
        } catch (TimeoutException expectedWhenTrulyEmpty) {
            // fall through
        }
        return driver.findElements(rowLocator);
    }

    // ========================================================================
    // CLICK SOMETHING THAT MAY BE UNDER A FIXED OVERLAY.
    // ========================================================================
    //
    // "element click intercepted: Element is not clickable at point (x, y)"
    // means the element is there and enabled, but something else occupies that
    // pixel. This console has several fixed-position candidates -- the ChaBot
    // launcher at z-[80], the mobile tab bar, sticky headers -- so a row action
    // near an edge can sit underneath one.
    //
    // Scrolling the element to the MIDDLE of the viewport fixes almost every
    // case, because the overlays live at the edges. The JS click is a last
    // resort: it dispatches straight to the element and ignores what is on top,
    // which also means it would happily click something a real user cannot
    // reach -- so it is never the first attempt, and the reason is logged when
    // it happens.
    protected void safeClick(By locator) {
        WebElement el = waitClickable(locator);
        try {
            el.click();
            pause();
            return;
        } catch (ElementClickInterceptedException first) {
            ((JavascriptExecutor) driver).executeScript(
                    "arguments[0].scrollIntoView({block:'center', inline:'center'});", el);
            try {
                waitClickable(locator).click();
                pause();
                return;
            } catch (ElementClickInterceptedException stillBlocked) {
                System.out.println("[selenium] " + locator + " stayed covered after "
                        + "scrolling; falling back to a JS click. If this appears often, "
                        + "a real user may be unable to reach that control either.");
                ((JavascriptExecutor) driver).executeScript("arguments[0].click();", el);
                pause();
            }
        }
    }

    // ========================================================================
    // TYPING INTO A REACT CONTROLLED INPUT, AND PROVING IT LANDED.
    // ========================================================================
    //
    // el.clear() sets the DOM value directly. React does not observe that, and
    // its internal value tracker can then SWALLOW the keystrokes that follow --
    // so the field visibly shows "admin" while React state is still "". The
    // form then submits empty credentials, or does nothing at all, and every
    // symptom points at the login endpoint instead of at the typing.
    //
    // So: no clear(). Select-all and overwrite, which fires real key events the
    // whole way. Then READ THE VALUE BACK. If the DOM does not hold what we
    // typed, fail here, naming the field -- rather than fifteen seconds later
    // with a timeout that blames the wrong thing.
    protected void type(By locator, String text) {
        WebElement el = waitClickable(locator);

        // ATTEMPT 1: real keystrokes. Preferred, because it exercises the same
        // path a person does -- focus, keydown, input, React state.
        //
        // No Cmd+A first. In Safari that is the PAGE's Select All, not the
        // field's: focus leaves the input, the characters that follow go
        // nowhere, and the field ends up empty. That is exactly what happened
        // here, and the dump said so: value="". Every field starts empty on a
        // freshly loaded form, so there is nothing to clear anyway.
        el.click();
        el.sendKeys(text);

        if (text.equals(el.getDomProperty("value"))) {
            pause();
            return;
        }

        // ATTEMPT 2: set the value through the NATIVE setter, then fire the
        // event React listens for.
        //
        // Assigning el.value directly does not work on a React controlled
        // input: React keeps its own value tracker, sees no change, and
        // discards the update. Going through the prototype's setter updates
        // that tracker, and the bubbling "input" event is what React's
        // synthetic event system actually subscribes to.
        //
        // This is a fallback, not the default, because it skips real key
        // handling -- a field with an onKeyDown filter would behave differently
        // here than for a person. If a test ever depends on that, it should
        // send keys explicitly rather than lean on this.
        ((JavascriptExecutor) driver).executeScript(
                "const el = arguments[0], v = arguments[1];"
                        + "const proto = el instanceof window.HTMLTextAreaElement"
                        + "  ? window.HTMLTextAreaElement.prototype"
                        + "  : window.HTMLInputElement.prototype;"
                        + "Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);"
                        + "el.dispatchEvent(new Event('input', { bubbles: true }));",
                el, text);

        String actual = el.getDomProperty("value");
        if (!text.equals(actual)) {
            dumpDiagnostics("typing-failed");
            throw new AssertionError(
                    "Could not put \"" + text + "\" into " + locator + " by keystrokes OR by "
                            + "the native value setter; the field holds \"" + actual + "\".");
        }
    }

    // ========================================================================
    // WHAT THE BROWSER ACTUALLY SAW, written to disk.
    // ========================================================================
    // A TimeoutException tells you a condition never came true. It does not
    // tell you what was on screen, which is the only thing that identifies the
    // cause. This writes a screenshot and a text dump to
    // target/selenium-failures/ so the next failure is evidence rather than
    // another round of speculation.
    protected void dumpDiagnostics(String label) {
        try {
            Path dir = Path.of("target", "selenium-failures");
            Files.createDirectories(dir);
            String stamp = label + "-" + System.currentTimeMillis();

            if (driver instanceof TakesScreenshot ts) {
                Files.write(dir.resolve(stamp + ".png"),
                        ts.getScreenshotAs(OutputType.BYTES));
            }

            StringBuilder sb = new StringBuilder();
            sb.append("url   : ").append(driver.getCurrentUrl()).append('\n');
            sb.append("title : ").append(driver.getTitle()).append('\n');
            for (String id : new String[]{"login-username", "login-password", "login-error"}) {
                List<WebElement> found = driver.findElements(testId(id));
                sb.append(id).append(" : ");
                if (found.isEmpty()) {
                    sb.append("(not on page)");
                } else {
                    WebElement e = found.get(0);
                    String v = e.getDomProperty("value");
                    sb.append(v != null ? "value=\"" + v + "\"" : "text=\"" + e.getText() + "\"");
                }
                sb.append('\n');
            }
            // What the page recorded: every fetch/XHR and any uncaught error.
            // This is the line that says whether a request was even attempted.
            sb.append("\n---- network / error log ----\n");
            try {
                Object log = ((JavascriptExecutor) driver)
                        .executeScript("return window.__chaghorTestLog || ['(probe not installed)'];");
                if (log instanceof List<?> entries) {
                    if (entries.isEmpty()) {
                        sb.append("(EMPTY -- the page made no requests at all. "
                                + "The submit handler never ran.)\n");
                    } else {
                        entries.forEach(e -> sb.append("  ").append(e).append('\n'));
                    }
                } else {
                    sb.append(log).append('\n');
                }
            } catch (Exception e) {
                sb.append("(could not read the probe: ").append(e).append(")\n");
            }

            sb.append("\n---- page source ----\n").append(driver.getPageSource());
            Files.writeString(dir.resolve(stamp + ".txt"), sb.toString());

            System.out.println("[selenium] wrote diagnostics to "
                    + dir.toAbsolutePath().resolve(stamp) + ".{png,txt}");
        } catch (Exception e) {
            System.out.println("[selenium] could not write diagnostics: " + e);
        }
    }

    // Sign in through the real form. Deliberately NOT a shortcut that injects a
    // JWT into localStorage: that would skip the exact code path -- the login
    // request, the token handling, the redirect -- these tests exist to prove.
    // ========================================================================
    // RECORD WHAT THE PAGE DOES, so "nothing happened" stops being the answer.
    // ========================================================================
    //
    // Safari exposes no console or network log over WebDriver, so the page has
    // to keep its own. This wraps fetch and XMLHttpRequest and installs an
    // error handler, appending to window.__chaghorTestLog; dumpDiagnostics()
    // reads it back.
    //
    // It distinguishes the two possibilities that look identical from outside:
    //   * NO entry for /auth/login  -> the click never triggered a submit
    //   * an entry with an empty username -> the fields were filled in the DOM
    //     but React never saw them, so the form submitted blank credentials
    //
    // Guarded by a flag because driver.get() reloads the page and would
    // otherwise wrap an already-wrapped fetch, doubling every entry.
    protected void installNetworkProbe() {
        ((JavascriptExecutor) driver).executeScript(
                "if (window.__chaghorProbeInstalled) { return; }"
                        + "window.__chaghorProbeInstalled = true;"
                        + "window.__chaghorTestLog = [];"
                        + "const log = (s) => window.__chaghorTestLog.push(s);"
                        + "const of_ = window.fetch;"
                        + "window.fetch = function (input, init) {"
                        + "  const url = (typeof input === 'string') ? input : (input && input.url);"
                        + "  log('fetch ' + url + ' body=' + ((init && init.body) || ''));"
                        + "  return of_.apply(this, arguments).then("
                        + "    (r) => { log('fetch <- ' + r.status + ' ' + url); return r; },"
                        + "    (e) => { log('fetch FAILED ' + url + ' : ' + e); throw e; });"
                        + "};"
                        + "const oo = window.XMLHttpRequest.prototype.open;"
                        + "const os = window.XMLHttpRequest.prototype.send;"
                        + "window.XMLHttpRequest.prototype.open = function (m, u) {"
                        + "  this.__u = m + ' ' + u; return oo.apply(this, arguments); };"
                        + "window.XMLHttpRequest.prototype.send = function (b) {"
                        + "  log('xhr ' + this.__u + ' body=' + (b || ''));"
                        + "  this.addEventListener('load', () => log('xhr <- ' + this.status + ' ' + this.__u));"
                        + "  this.addEventListener('error', () => log('xhr FAILED ' + this.__u));"
                        + "  return os.apply(this, arguments); };"
                        + "window.addEventListener('error', (e) => log('window error: ' + e.message));"
                        + "window.addEventListener('unhandledrejection',"
                        + "  (e) => log('unhandled rejection: ' + e.reason));");
    }

    protected void login(String username, String password) {
        driver.get(BASE_URL + "/login");
        installNetworkProbe();
        type(testId("login-username"), username);
        type(testId("login-password"), password);
        waitClickable(testId("login-submit")).click();

        // WAIT FOR AN OUTCOME, NOT FOR A DESTINATION.
        //
        // Submitting has exactly two honest endings: we leave /login, or an
        // error appears. Waiting here for either means a caller that later times
        // out waiting for "/admin" has already been told the more useful thing:
        // whether the form responded at all.
        //
        // Both wrong-password and success pass through here, which is the point
        // -- a submit that produces NEITHER is the real failure, and it used to
        // surface fifteen seconds later as "url never contained /admin", which
        // reads like a routing bug rather than a form that never submitted.
        try {
            wait.until(d -> !d.getCurrentUrl().contains("/login")
                    || !d.findElements(testId("login-error")).isEmpty());
        } catch (TimeoutException e) {
            dumpDiagnostics("login-no-response");
            throw new AssertionError(
                    "Submitted the login form as \"" + username + "\" and nothing happened: "
                            + "no redirect and no error message after 15s.\n"
                            + "The fields DID hold the typed values (type() verifies that), so "
                            + "the form submitted into silence.\n"
                            + "Most likely the browser could not reach the API at " + API_URL
                            + " -- check app.cors.allowed-origins includes " + BASE_URL
                            + ", and that the backend is still up.\n"
                            + "A screenshot and the page source are in target/selenium-failures/.",
                    e);
        }
    }

    protected void loginAsAdmin() {
        login(ADMIN_USER, ADMIN_PASS);
        wait.until(ExpectedConditions.urlContains("/admin"));
    }

    // ========================================================================
    // READING MONEY: ASK THE API, NOT THE SCREEN.
    // ========================================================================
    //
    // The Finance card renders Cash on Hand through takaCompact(), which turns
    // 121,540 into "1.2L". Asserting a ledger delta against a rounded display
    // string would be asserting that the formatter is stable, not that the
    // money moved -- and it would pass while being off by thousands.
    //
    // So a money assertion reads the same endpoint the screen reads, and gets
    // the full value. The BROWSER still drives every action; only the
    // measurement comes from the API.
    protected String apiToken(String username, String password) {
        try {
            HttpClient http = HttpClient.newHttpClient();
            HttpRequest req = HttpRequest.newBuilder(URI.create(API_URL + "/api/v1/auth/login"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                fail("Could not get an API token for " + username + ": HTTP "
                        + res.statusCode() + " " + res.body());
            }
            return extract(res.body(), "token");
        } catch (Exception e) {
            fail("Could not get an API token for " + username + ": " + e);
            return null;
        }
    }

    protected double cashOnHand(String token) {
        try {
            HttpClient http = HttpClient.newHttpClient();
            HttpRequest req = HttpRequest.newBuilder(
                            URI.create(API_URL + "/api/v1/finance/summary"))
                    .header("Authorization", "Bearer " + token)
                    .GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                fail("GET /finance/summary returned HTTP " + res.statusCode() + ": " + res.body());
            }
            return Double.parseDouble(extract(res.body(), "cashOnHand"));
        } catch (Exception e) {
            fail("Could not read cash on hand: " + e);
            return 0;
        }
    }

    // A deliberately tiny extractor rather than a JSON dependency. It reads one
    // scalar field from a flat response, which is all these two calls need.
    // If a test ever needs nested JSON, add Jackson -- do not grow this.
    private static String extract(String json, String field) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("\"" + field + "\"\\s*:\\s*\"?([^,\"}]+)\"?")
                .matcher(json);
        if (!m.find()) {
            fail("No field \"" + field + "\" in response: " + json);
        }
        return m.group(1).trim();
    }

    // ========================================================================
    // SKIP, AND SAY WHY WHERE SOMEONE WILL SEE IT.
    // ========================================================================
    //
    // Assumptions.assumeTrue(cond, "reason") skips the test, but surefire
    // writes <skipped/> to the XML report with NO message attribute -- the
    // reason is simply lost. A run then reports "Skipped: 5" and gives you no
    // way to find out what five things were missing, which is barely better
    // than not running them.
    //
    // Printing first puts the reason in the console output, where it is
    // actually read. Use this everywhere instead of calling Assumptions
    // directly.
    protected void skipUnless(boolean condition, String reason) {
        if (!condition) {
            System.out.println("[selenium] SKIPPED: " + reason);
        }
        org.junit.jupiter.api.Assumptions.assumeTrue(condition, reason);
    }

    // Choose an option in a <select> by its value.
    //
    // Selenium's Select helper fires the change event React listens for, so a
    // controlled <select> updates its state -- unlike setting .value directly,
    // which React ignores for the same reason it ignores a directly-set input
    // value.
    protected void selectOption(By locator, String value) {
        new org.openqa.selenium.support.ui.Select(waitClickable(locator))
                .selectByValue(value);
        pause();
    }

    // True when the element exists at all, without waiting 15 seconds first.
    // Used for "this should NOT be here" assertions, where the implicit wait
    // would otherwise make every passing test take a quarter of a minute.
    protected boolean exists(By locator) {
        return !driver.findElements(locator).isEmpty();
    }
}
