package com.chaghor.chaghor.web;

import com.chaghor.chaghor.web.dto.LoanAffordability;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

// Puts the loan affordability figures into one Bangla sentence.
//
// A SEPARATE CLASS FOR A STRUCTURAL REASON, not tidiness. MeWorkerService uses
// Lombok's @RequiredArgsConstructor, which cannot carry a @Value-injected
// property -- the codebase rule is that services needing config get an explicit
// constructor (LoanService, WeatherBriefService, PluckAdvisorService all do).
// Putting the HTTP client here keeps MeWorkerService free of network concerns
// entirely: it computes, this phrases.
//
// THE MODEL IS ALLOWED TO DISCOURAGE, and the prompt says so explicitly.
// Assistants are tuned to be agreeable, which is the wrong instinct when the
// reader is a low-paid worker deciding whether to take on debt. If the
// instalment is a large share of their pay, saying so is the useful answer.
//
// It approves nothing. The request is a separate call, the row is created
// PENDING, and only LoanService.decide() -- admin-only -- can move it.
@Service
public class LoanNoteService {

    private final String aiBaseUrl;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();

    public LoanNoteService(
            @Value("${app.ai.service.url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.aiBaseUrl = aiBaseUrl.replaceAll("/+$", "");
        // HTTP/1.1 pinned -- Java defaults to HTTP/2, uvicorn rejects the h2c
        // upgrade, the body arrives mangled and FastAPI answers 422.
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    // Returns {note, provider} or {note: null, error}. NEVER throws: a missing
    // sentence must not take the arithmetic off the screen with it.
    public Map<String, Object> phrase(LoanAffordability a) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("amount", a.amount());
            payload.put("daily_deduction", a.dailyDeduction());
            payload.put("working_days", a.workingDaysToClear());
            payload.put("months", a.approxMonthsToClear());
            payload.put("current_outstanding", a.currentOutstanding());
            payload.put("total_after", a.totalAfterThisLoan());
            payload.put("recent_avg_net_pay", a.recentAvgNetPay());
            payload.put("instalment_pct_of_pay", a.instalmentPctOfPay());

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(aiBaseUrl + "/loan-note"))
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
            Map<?, ?> body = mapper.readValue(res.body(), Map.class);
            out.put("note", body.get("note"));
            out.put("provider", body.get("provider"));
        } catch (Exception e) {
            out.put("note", null);
            out.put("error", "লিখিত ব্যাখ্যা এখন পাওয়া যাচ্ছে না — উপরের হিসাব ঠিক আছে।");
        }
        return out;
    }
}
