package com.chaghor.chaghor.harvest;

import com.chaghor.chaghor.harvest.dto.PluckAdvice;
import com.chaghor.chaghor.leaf.LeafCollection;
import com.chaghor.chaghor.leaf.LeafCollectionRepository;
import com.chaghor.chaghor.weather.WeatherLogRepository;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Which field should be plucked next.
//
// THE WHOLE RANKING IS ARITHMETIC. Tea is picked on a round of roughly 7-10
// days; leaf left past the round coarsens and grades down. Days since the last
// weigh-in on a field is therefore a direct, checkable predictor of tomorrow's
// quality, and leaf_collection already holds every row needed to compute it.
//
// The model is given the finished table and asked to write a paragraph about
// it. It cannot reorder the list, cannot invent a field, and cannot change a
// number. If ai_service is down the paragraph is null and the advice is
// unaffected -- which is the opposite of how the photo grader behaves, and
// deliberately so after that one measured at chance.
@Service
public class PluckAdvisorService {

    // The pluck round this advice is measured against. Seven to ten days is the
    // usual interval in Sylhet; eight is the middle of it. Stated in the
    // response so a reader can see what "overdue" means rather than trust the
    // word.
    private static final int CYCLE_DAYS = 8;

    // How far back to look for the last pluck and the recent average. Long
    // enough to catch a field that has been left, short enough that a field
    // picked once last month does not look active.
    private static final int LOOKBACK_DAYS = 45;

    // Rain threshold, matched to LeafCollectionService.forecast() on purpose --
    // two different definitions of "heavy rain" on the same screen would be
    // worse than one imperfect definition.
    private static final double HEAVY_RAIN_MM = 10.0;

    private final LeafCollectionRepository leafRepository;
    private final ZoneRepository zoneRepository;
    private final WeatherLogRepository weatherLogRepository;
    private final String aiBaseUrl;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();

    public PluckAdvisorService(LeafCollectionRepository leafRepository,
                               ZoneRepository zoneRepository,
                               WeatherLogRepository weatherLogRepository,
                               @Value("${app.ai.service.url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.leafRepository = leafRepository;
        this.zoneRepository = zoneRepository;
        this.weatherLogRepository = weatherLogRepository;
        this.aiBaseUrl = aiBaseUrl.replaceAll("/+$", "");
        // HTTP/1.1 pinned. Java's HttpClient defaults to HTTP/2 and attaches an
        // h2c upgrade header that uvicorn rejects with "Unsupported upgrade
        // request", after which the body arrives mangled and FastAPI answers
        // 422. This cost a day once already.
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Transactional(readOnly = true)
    public PluckAdvice advise(boolean withNarrative) {
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusDays(LOOKBACK_DAYS);

        // One sweep of the window, then everything is computed in memory --
        // matching how every other board here resolves its numbers.
        Map<Long, LocalDate> lastPluck = new HashMap<>();
        Map<Long, BigDecimal> totalKg = new HashMap<>();
        Map<Long, Map<LocalDate, Boolean>> pluckDays = new HashMap<>();

        for (LeafCollection lc : leafRepository.findByCollectDateBetween(from, today)) {
            Long z = lc.getZoneId();
            if (z == null || lc.getCollectDate() == null) continue;
            lastPluck.merge(z, lc.getCollectDate(),
                    (a, b) -> a.isAfter(b) ? a : b);
            totalKg.merge(z, nz(lc.getWeightKg()), BigDecimal::add);
            pluckDays.computeIfAbsent(z, k -> new HashMap<>()).put(lc.getCollectDate(), true);
        }

        List<PluckAdvice.Field> rows = new ArrayList<>();
        for (Zone z : zoneRepository.findAll()) {
            if (z.getArchivedAt() != null) continue;   // retired: not a field any more

            LocalDate last = lastPluck.get(z.getId());
            Integer daysSince = (last == null)
                    ? null
                    : (int) ChronoUnit.DAYS.between(last, today);

            // Mean kg per DAY THE FIELD WAS ACTUALLY PLUCKED, not per calendar
            // day. Dividing by the window would punish a field simply for being
            // on a long round, which is the thing being measured.
            BigDecimal avg = null;
            int days = pluckDays.getOrDefault(z.getId(), Map.of()).size();
            if (days > 0) {
                avg = totalKg.getOrDefault(z.getId(), BigDecimal.ZERO)
                        .divide(BigDecimal.valueOf(days), 1, RoundingMode.HALF_UP);
            }

            String band;
            String reason;
            Integer overdue = (daysSince == null) ? null : daysSince - CYCLE_DAYS;

            if (!"active".equals(z.getStatus())) {
                // A field closed for pruning is not "overdue" -- it is shut, on
                // purpose, and telling a supervisor to pluck it would be wrong.
                band = "CLOSED";
                reason = "Closed — this field is marked " + z.getStatus() + ".";
            } else if (daysSince == null) {
                // Never plucked in the window. This is NOT the same as being
                // very overdue: it usually means nobody has weighed in against
                // this field yet, and saying "42 days overdue" would invent a
                // history that does not exist.
                band = "NO_DATA";
                reason = "No weigh-in recorded against this field in the last "
                        + LOOKBACK_DAYS + " days, so its round cannot be worked out.";
            } else if (overdue > 2) {
                band = "OVERDUE";
                reason = "Last plucked " + daysSince + " days ago — " + overdue
                        + " past the usual " + CYCLE_DAYS + "-day round. Leaf this old"
                        + " tends to come in coarse.";
            } else if (daysSince >= CYCLE_DAYS) {
                band = "DUE";
                reason = "Last plucked " + daysSince + " days ago — due now.";
            } else {
                band = "RESTING";
                reason = "Plucked " + daysSince + " day" + (daysSince == 1 ? "" : "s")
                        + " ago — " + (CYCLE_DAYS - daysSince) + " to go before the next round.";
            }

            rows.add(new PluckAdvice.Field(
                    z.getId(), z.getName(), daysSince, last, overdue, avg, band, reason));
        }

        // Most urgent first: overdue before due before resting, and within a
        // band the field left longest. CLOSED and NO_DATA sort last -- neither
        // is an instruction to go and pick something.
        Map<String, Integer> order = Map.of(
                "OVERDUE", 0, "DUE", 1, "RESTING", 2, "NO_DATA", 3, "CLOSED", 4);
        rows.sort(Comparator
                .comparingInt((PluckAdvice.Field f) -> order.getOrDefault(f.band(), 9))
                .thenComparing(f -> f.daysSinceLastPluck() == null ? Integer.MIN_VALUE
                        : -f.daysSinceLastPluck()));

        String weatherNote = weatherNote();

        String narrative = null;
        String narrativeError = null;
        if (withNarrative) {
            try {
                narrative = narrate(rows, weatherNote);
            } catch (Exception e) {
                // The advice is the table. A missing paragraph is a missing
                // paragraph, not a failed request.
                narrativeError = "The written summary is unavailable — "
                        + "the AI service did not answer. The ranking below is unaffected.";
            }
        }

        return new PluckAdvice(rows, weatherNote, CYCLE_DAYS, narrative, narrativeError);
    }

    private String weatherNote() {
        var latest = weatherLogRepository.findAllByOrderByIdDesc(PageRequest.of(0, 1));
        if (latest.isEmpty()) return null;
        BigDecimal rain = latest.get(0).getRainfallMm();
        if (rain == null || rain.doubleValue() < HEAVY_RAIN_MM) return null;
        return "Heavy rain in the last reading (" + rain + " mm). Wet leaf weighs more "
                + "and pluckers move slower, so today's kilos will read high and the "
                + "round may slip.";
    }

    // Ask the model to write the paragraph. It receives the finished ranking and
    // is told, in the prompt, that the order is not its to change.
    private String narrate(List<PluckAdvice.Field> rows, String weatherNote) throws Exception {
        List<Map<String, Object>> compact = new ArrayList<>();
        for (PluckAdvice.Field f : rows) {
            if ("CLOSED".equals(f.band())) continue;   // nothing to say about a shut field
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("field", f.zoneName());
            m.put("days_since_last_pluck", f.daysSinceLastPluck());
            m.put("days_overdue", f.daysOverdue());
            m.put("recent_avg_kg", f.recentAvgKg());
            m.put("band", f.band());
            compact.add(m);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("cycle_days", CYCLE_DAYS);
        payload.put("weather_note", weatherNote);
        payload.put("fields", compact);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(aiBaseUrl + "/pluck-advice"))
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
        return summary == null ? null : summary.toString();
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
