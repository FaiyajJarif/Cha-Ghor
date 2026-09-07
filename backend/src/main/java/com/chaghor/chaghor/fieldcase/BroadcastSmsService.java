package com.chaghor.chaghor.fieldcase;

import com.chaghor.chaghor.sms.SmsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

// Turning a broadcast into text messages workers actually receive.
//
// WHY THIS EXISTS
//   The feature was called Broadcast and did not broadcast. Pressing "Weather
//   alert" filed a case and pushed a WebSocket frame, so it reached admin's
//   console and any browser already open on the page -- and nobody standing in
//   a field. Meanwhile a complete SMS stack (sender, mock sender, delivery log,
//   an unused `alert` category) had been sitting in the codebase, used to tell
//   workers their wages had landed. The estate could text a man that he had
//   been paid but not that a storm was coming.
//
// TWO SEPARATE THINGS LIVE HERE, and the split is the safety property:
//
//   rewrite()  asks a model to shorten the message into Bangla. Sends nothing.
//   send()     sends exactly the characters it is given. Asks no model.
//
//   Because they cannot happen in one step, a model can never put words on
//   somebody's phone. The supervisor reads the final text, edits it if they
//   want, and confirms; only then does anything leave the building.
@Service
public class BroadcastSmsService {

    // The gateway bills per 160 characters of GSM-7, but Bangla is UCS-2 and
    // only 70 fit in a part. Worth knowing here so the API can report the true
    // part count rather than a comforting one.
    private static final int GSM7_PART = 160;
    private static final int UCS2_PART = 70;

    private final FieldCaseRepository cases;
    private final SmsService smsService;
    private final String aiBaseUrl;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();

    public BroadcastSmsService(FieldCaseRepository cases,
                               SmsService smsService,
                               @Value("${app.ai.service.url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.cases = cases;
        this.smsService = smsService;
        this.aiBaseUrl = aiBaseUrl.replaceAll("/+$", "");
        // HTTP/1.1 pinned -- Java defaults to HTTP/2 and uvicorn rejects the
        // h2c upgrade, after which the body arrives mangled and FastAPI
        // answers 422.
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    // How many workers a broadcast would reach, before anything is sent.
    //
    // The confirm step is built on this number, so it counts PEOPLE WHO WILL
    // GET A TEXT -- active workers with a phone on file in the named field --
    // not rows that will appear in a log.
    public Map<String, Object> preview(String zoneName) {
        var recipients = smsService.alertRecipients(zoneName);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("count", recipients.size());
        out.put("zone", (zoneName == null || zoneName.isBlank()) ? null : zoneName);
        // A few names, so the supervisor can sanity-check they have the right
        // field before texting forty people.
        out.put("sample", recipients.stream().limit(5)
                .map(w -> w.getFullName())
                .toList());
        return out;
    }

    // Shorten and translate. SENDS NOTHING.
    public Map<String, Object> rewrite(String title, String body, String priority,
                                       String zone, String language) {
        if (body == null || body.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Write the message first, then it can be shortened.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", title);
        payload.put("body", body);
        payload.put("priority", priority);
        payload.put("zone", zone);
        payload.put("language", (language == null || language.isBlank()) ? "bn" : language);

        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(aiBaseUrl + "/sms-rewrite"))
                    .header("Content-Type", "application/json")
                    // 75s, ABOVE ai_service's own 60s total budget.
                    //
                    // ai_service splits that budget across the primary provider
                    // and the fallback, so a whole call is bounded at ~60s. This
                    // timeout is the backstop for the case where ai_service is
                    // wedged entirely -- it must NOT be the thing that fires
                    // first, which is what produced
                    // "HttpTimeoutException: request timed out" while the
                    // fallback was still running.
                    .timeout(Duration.ofSeconds(75))
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload)))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                throw new IllegalStateException("AI service returned " + res.statusCode());
            }
            Map<?, ?> b = mapper.readValue(res.body(), Map.class);
            String text = b.get("message") == null ? null : b.get("message").toString();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("message", text);
            out.put("provider", b.get("provider"));
            addLength(out, text);
            return out;
        } catch (Exception e) {
            // A failed rewrite is not a failed broadcast. The supervisor can
            // still send what they typed, so this reports rather than throws.
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("message", null);
            out.put("error", "Could not shorten that automatically — the AI service "
                    + "did not answer. You can still send the message as you wrote it.");
            return out;
        }
    }

    // Send exactly this text. No model is consulted here.
    public Map<String, Object> send(Long caseId, String message) {
        FieldCase c = cases.findById(caseId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "That broadcast no longer exists."));

        String text = message == null ? null : message.trim();
        if (text == null || text.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "There is no message to send.");
        }

        try {
            Map<String, Object> result = smsService.broadcastAlert(caseId, c.getZone(), text);
            addLength(result, text);
            return result;
        } catch (IllegalStateException e) {
            // Already sent. A conflict, not a server error -- and the message
            // says plainly what happened rather than looking like a crash.
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    // Report the true cost of the text, not the flattering one. Any non-Latin
    // character forces UCS-2 encoding for the WHOLE message, which cuts the
    // per-part budget from 160 to 70 -- so a 100-character Bangla alert is two
    // messages per recipient, not one.
    private void addLength(Map<String, Object> out, String text) {
        if (text == null) return;
        boolean unicode = text.chars().anyMatch(ch -> ch > 127);
        int per = unicode ? UCS2_PART : GSM7_PART;
        out.put("length", text.length());
        out.put("encoding", unicode ? "unicode" : "gsm7");
        out.put("parts", (int) Math.ceil(text.length() / (double) per));
        out.put("charsPerPart", per);
    }
}
