package com.chaghor.chaghor.sms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;

// Sends a real SMS through the developer's own iPhone, via macOS Messages.
//
// Active only when `sms.provider=macmessages`.
//
// ============================================================================
// HOW THIS WORKS, AND WHY IT EXISTS
// ============================================================================
//
// iOS gives third-party software NO way to send an SMS without a human tapping
// send -- MFMessageComposeViewController always shows the compose sheet, and
// there is no equivalent of Android's SEND_SMS permission to request. So an
// iPhone alone cannot be an SMS gateway.
//
// macOS can, indirectly. With Text Message Forwarding enabled, Messages.app on
// a Mac sends green-bubble SMS out through the paired iPhone's SIM, and
// Messages is AppleScript-addressable. The backend therefore shells out to
// `osascript` on the machine it is running on.
//
// ============================================================================
// READ THIS BEFORE RELYING ON IT
// ============================================================================
//
// This is a DEMO transport, and a fragile one:
//
//   * It only works when the backend runs on that specific Mac, signed in to
//     that Apple ID, with the iPhone nearby and Text Message Forwarding on.
//   * Apple has repeatedly tightened Messages automation. On recent macOS
//     versions, AppleScript sending to non-iMessage numbers is unreliable --
//     it works for some people and silently does nothing for others.
//   * The first run raises a macOS Automation consent prompt. Until somebody
//     clicks Allow, every send fails.
//
// It is wired the same way as every other provider precisely so that none of
// this leaks: if it fails, it returns SmsSendResult.failed(...) like any other
// gateway, the row still lands in sms_log, and swapping to a real provider is
// one property. Do not present it as production delivery.
//
// ============================================================================
// INJECTION: WHY THE MESSAGE IS PASSED AS argv AND NEVER CONCATENATED
// ============================================================================
//
// The naive version builds an AppleScript string with the phone number and the
// message inside it. That is an injection hole with two mouths: a message
// containing a double quote breaks the script, and a crafted one could append
// arbitrary AppleScript -- which on a Mac means arbitrary code, with the user's
// privileges. The message text here is partly MODEL-GENERATED (the Bangla SMS
// rewrite) and partly typed by a supervisor, so neither end is trusted.
//
// Two defences, both structural rather than filtering:
//
//   1. ProcessBuilder with a LIST of arguments. No shell is spawned at all, so
//      shell metacharacters (; | $() `) have nothing to interpret them.
//   2. The script uses `on run argv` and reads the number and body out of argv.
//      The untrusted text is passed as a parameter AFTER the script source, so
//      it is data to AppleScript, never source code. Escaping is not attempted
//      anywhere, because escaping is what you do when you have already lost.
@Component
@ConditionalOnProperty(name = "sms.provider", havingValue = "macmessages")
public class MacMessagesSmsSender implements SmsSender {

    private static final Logger log = LoggerFactory.getLogger(MacMessagesSmsSender.class);

    // AppleScript, one -e line per element. `item 1 of argv` / `item 2 of argv`
    // are the only places untrusted input appears, and they are reads, not
    // interpolations.
    //
    // `service type = SMS` forces the message out over the CELLULAR path rather
    // than iMessage. Without it, a number that happens to be an Apple ID would
    // silently go as a blue-bubble iMessage -- which would demonstrate nothing
    // about SMS, and would not reach a worker on a feature phone at all.
    private static final List<String> SCRIPT = List.of(
            "on run argv",
            "  set phoneNumber to item 1 of argv",
            "  set messageText to item 2 of argv",
            "  tell application \"Messages\"",
            "    set smsService to 1st account whose service type = SMS",
            "    set theBuddy to participant phoneNumber of smsService",
            "    send messageText to theBuddy",
            "  end tell",
            "end run");

    private final int timeoutSeconds;

    // Explicit constructor, no Lombok: this service takes @Value config, which
    // is the documented exception in CLAUDE.md §6.
    public MacMessagesSmsSender(
            @Value("${sms.macmessages.timeout-seconds:20}") int timeoutSeconds) {
        this.timeoutSeconds = timeoutSeconds;
    }

    @Override
    public String providerName() {
        return "macmessages";
    }

    @Override
    public SmsSendResult send(String phone, String message) {
        // Fail clearly rather than confusingly. osascript does not exist off
        // macOS, and "Cannot run program" is a worse error than saying so.
        String os = System.getProperty("os.name", "");
        if (!os.toLowerCase().contains("mac")) {
            log.warn("[macmessages] selected but this is not macOS ({}); NOT sent to {}", os, phone);
            return SmsSendResult.failed("macmessages provider only runs on macOS (host is " + os + ")");
        }
        if (phone == null || phone.isBlank()) {
            return SmsSendResult.failed("no phone number");
        }
        if (message == null || message.isEmpty()) {
            return SmsSendResult.failed("empty message");
        }

        java.util.List<String> cmd = new java.util.ArrayList<>();
        cmd.add("osascript");
        for (String line : SCRIPT) {
            cmd.add("-e");
            cmd.add(line);
        }
        // Everything after the script is argv. THE UNTRUSTED VALUES GO HERE,
        // as separate process arguments — never inside a -e line.
        cmd.add(phone);
        cmd.add(message);

        Process p = null;
        try {
            p = new ProcessBuilder(cmd).redirectErrorStream(true).start();

            // A hung Messages.app must not hang a web request. osascript will
            // sit forever waiting on a consent dialog nobody is looking at.
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                log.warn("[macmessages] osascript timed out after {}s sending to {}",
                        timeoutSeconds, phone);
                return SmsSendResult.failed("osascript timed out after " + timeoutSeconds + "s");
            }

            String output = read(p.getInputStream()).trim();
            int exit = p.exitValue();
            if (exit == 0) {
                log.info("[macmessages] handed to Messages.app for {}", phone);
                // "sent" means Messages ACCEPTED it, not that a tower delivered
                // it. No provider here gives a delivery receipt, and claiming
                // one would be a lie in the sms_log.
                return SmsSendResult.sent("handed to Messages.app (no delivery receipt)");
            }

            // The two failures worth naming, because both look like "nothing
            // happened" and both have a specific fix.
            String hint = "";
            if (output.contains("Not authorized") || output.contains("-1743")) {
                hint = " — macOS has not granted Automation access. "
                        + "System Settings → Privacy & Security → Automation, "
                        + "allow the backend (or Terminal) to control Messages.";
            } else if (output.contains("Can't get account") || output.contains("-1728")) {
                hint = " — no SMS account in Messages. Turn on Text Message "
                        + "Forwarding on the iPhone (Settings → Messages) and "
                        + "make sure the Mac is signed in to the same Apple ID.";
            }

            // THE HINT IS LOGGED, NOT JUST RETURNED, and that is deliberate:
            // SmsService reads only result.status() and never persists
            // result.detail(), so sms_log records "failed" with no reason. The
            // server console is the only place the fix instructions can
            // actually be read. (Giving sms_log a detail column would be the
            // real fix, and is a schema change nobody has asked for yet.)
            log.warn("[macmessages] osascript exit {} for {}: {}{}", exit, phone, output, hint);
            return SmsSendResult.failed("osascript exit " + exit + ": " + brief(output) + hint);

        } catch (IOException e) {
            log.warn("[macmessages] could not run osascript: {}", e.getMessage());
            return SmsSendResult.failed("could not run osascript: " + e.getMessage());
        } catch (InterruptedException e) {
            // Restore the flag rather than swallowing it -- something upstream
            // asked this thread to stop.
            Thread.currentThread().interrupt();
            if (p != null) p.destroyForcibly();
            return SmsSendResult.failed("interrupted while sending");
        }
    }

    private static String read(InputStream in) throws IOException {
        return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }

    // sms_log.detail is a short human note, not a transcript.
    private static String brief(String s) {
        String one = s.replaceAll("\\s+", " ").trim();
        return one.length() <= 160 ? one : one.substring(0, 157) + "...";
    }
}
