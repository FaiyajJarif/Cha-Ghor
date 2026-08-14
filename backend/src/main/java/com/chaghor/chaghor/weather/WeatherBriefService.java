package com.chaghor.chaghor.weather;

import com.chaghor.chaghor.weather.dto.RainImpact;
import com.chaghor.chaghor.weather.dto.WeatherResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// A written weather note for the supervisor.
//
// WHAT THIS IS AND IS NOT
//   The Weather Monitor already carries a rule-based harvest recommendation:
//   fixed thresholds, every line printed with the measurement it came from. It
//   is not going anywhere, and the model is not allowed to duplicate it. If
//   both issued a verdict they could disagree on the same screen and a reader
//   would have no way to tell which to trust.
//
//   So this endpoint DESCRIBES and the rules DECIDE. The prompt says so in as
//   many words, and it is also told never to invent a figure.
//
//   Everything it is given is a fact the server already holds: the stored
//   reading, the short forecast, and -- only when there is enough data -- the
//   measured rain impact. It gets no freedom to reach for anything else.
//
// The briefing is entirely optional. If ai_service is down this returns null
// and the page shows the reading, the forecast, the rule-based advice and the
// measured rain figure exactly as before. Nothing depends on the paragraph.
@Service
public class WeatherBriefService {

    private final WeatherService weatherService;
    private final RainImpactService rainImpactService;
    private final String aiBaseUrl;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();

    public WeatherBriefService(WeatherService weatherService,
                               RainImpactService rainImpactService,
                               @Value("${app.ai.service.url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.weatherService = weatherService;
        this.rainImpactService = rainImpactService;
        this.aiBaseUrl = aiBaseUrl.replaceAll("/+$", "");
        // HTTP/1.1 pinned. Java's HttpClient defaults to HTTP/2 and attaches an
        // h2c upgrade header that uvicorn rejects, after which the body arrives
        // mangled and FastAPI answers 422. Every other caller here does the
        // same for the same reason.
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    // Returns {summary, provider, error}. `summary` is null when there is
    // nothing to say or the service could not be reached; `error` then carries
    // a sentence the UI can show instead of failing.
    // `language` is "bn" for Bangla, anything else for English.
    //
    // WHY THIS MATTERS MORE THAN IT LOOKS: the supervisors this screen is for
    // work on a Sylhet estate and read Bangla far more comfortably than
    // English. An advisory nobody reads is worth nothing, and this is the one
    // part of the page that is prose rather than numbers -- the figures are
    // legible in any language, the sentences are not.
    public Map<String, Object> brief(String language) {
        Map<String, Object> out = new LinkedHashMap<>();
        WeatherResponse w = weatherService.current();

        boolean bn = language != null && language.toLowerCase().startsWith("bn");

        if (w == null || !w.available()) {
            out.put("summary", null);
            // The error is prose too, so it is translated with everything else.
            // Falling back to an English apology in a Bangla UI is exactly the
            // moment a supervisor stops trusting the screen.
            out.put("error", bn
                    ? "এখনো কোনো আবহাওয়ার তথ্য নেই। উপরে Refresh চাপুন।"
                    : "There is no weather reading yet. Press Refresh first.");
            return out;
        }

        // Only the fields that are actually measurements. Nulls are dropped
        // rather than sent as zero -- a model handed "windKph: 0" will write
        // about still air that nobody recorded.
        Map<String, Object> reading = new LinkedHashMap<>();
        put(reading, "temperatureC", w.tempC());
        put(reading, "feelsLikeC", w.feelsLikeC());
        put(reading, "humidityPct", w.humidity());
        put(reading, "rainfallMm", w.rainfall24hMm());
        put(reading, "windKph", w.windKph());
        put(reading, "chanceOfRainPct", w.rainProbPct());
        if (w.condition() != null) reading.put("condition", w.condition());
        if (w.observedAt() != null) reading.put("observedAt", w.observedAt());

        List<Map<String, Object>> days = new java.util.ArrayList<>();
        if (w.forecast() != null) {
            for (var d : w.forecast()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("day", d.day());
                m.put("condition", d.condition());
                put(m, "maxC", d.maxC());
                put(m, "minC", d.minC());
                days.add(m);
            }
        }

        // Only pass the rain figure when it is real. Sending the fallback would
        // invite the model to describe a guess as though it were measured --
        // exactly the confusion this whole feature exists to remove.
        Map<String, Object> impact = null;
        try {
            RainImpact ri = rainImpactService.measure();
            if (ri.enoughData() && ri.factor() != null) {
                impact = new LinkedHashMap<>();
                impact.put("wetDayYieldAsFractionOfDry", ri.factor());
                impact.put("wetDaysMeasured", ri.wetDays());
                impact.put("dryDaysMeasured", ri.dryDays());
                impact.put("note", "measured from this estate's own records");
            }
        } catch (Exception ignored) {
            // A briefing without the rain figure is still a briefing.
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("reading", reading);
        payload.put("forecast", days);
        payload.put("rain_impact", impact);
        payload.put("language", bn ? "bn" : "en");

        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(aiBaseUrl + "/weather-brief"))
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
            Object summary = body.get("summary");
            out.put("summary", summary == null ? null : summary.toString());
            out.put("provider", body.get("provider"));
        } catch (Exception e) {
            out.put("summary", null);
            out.put("error", bn
                    ? "লিখিত সারাংশ এখন পাওয়া যাচ্ছে না — AI সার্ভিস সাড়া দেয়নি। "
                      + "এই পাতার বাকি সব তথ্য ঠিক আছে।"
                    : "The written briefing is unavailable — the AI service "
                      + "did not answer. Everything else on this page is unaffected.");
        }
        return out;
    }

    private static void put(Map<String, Object> m, String k, BigDecimal v) {
        if (v != null) m.put(k, v);
    }
}
