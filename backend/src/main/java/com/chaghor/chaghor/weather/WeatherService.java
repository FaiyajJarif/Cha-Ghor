package com.chaghor.chaghor.weather;

import com.chaghor.chaghor.weather.dto.WeatherEvent;
import com.chaghor.chaghor.weather.dto.WeatherResponse;
import com.chaghor.chaghor.weather.dto.WeatherTrendPoint;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
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
import java.util.ArrayList;
import java.util.List;

// Weather for the estate.
//
// Readings come from Open-Meteo, which is free and needs no API key -- chosen
// deliberately so this works on a fresh clone with nothing to configure, and so
// there is no second secret to leak alongside the Gemini one.
//
// The estate is in Sylhet; coordinates are configurable in application.yaml.
//
// DESIGN NOTE: reads NEVER call the API. `current()` and `trend()` only read
// weather_log. Fetching is a separate explicit action -- refresh(), driven by
// the Refresh button and by scheduledRefresh() below -- so opening the
// dashboard can never hang on somebody else's server being slow, and a failed
// fetch degrades to the last good reading rather than an error page.
//
// THE SCHEDULE IS NEW, AND ITS ABSENCE WAS A REAL BUG. This comment previously
// claimed refresh() was "also driven by a schedule" when nothing scheduled it:
// the only trigger was a human pressing Refresh. That is worse than it sounds,
// because four things read weather_log and none of them can tell how old it is:
//
//   * the harvest recommendation on the Weather screen
//   * LeafCollectionService.forecast()   -- the rain factor
//   * PluckAdvisorService                -- the weather note
//   * ZoneService.suggestCondition()     -- rain softening a poor-yield call
//
// On an estate where nobody happened to press the button, all four were quietly
// reasoning from a stale reading, or from none.
@Service
public class WeatherService {

    private static final Logger log = LoggerFactory.getLogger(WeatherService.class);

    private final WeatherLogRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    private final com.chaghor.chaghor.notification.NotificationService notifications;
    private final double latitude;
    private final double longitude;
    private final boolean enabled;

    public WeatherService(WeatherLogRepository repo,
                          com.chaghor.chaghor.notification.NotificationService notifications,
                          @Value("${app.weather.latitude:24.8949}") double latitude,
                          @Value("${app.weather.longitude:91.8687}") double longitude,
                          @Value("${app.weather.enabled:true}") boolean enabled) {
        this.repo = repo;
        this.notifications = notifications;
        this.latitude = latitude;
        this.longitude = longitude;
        this.enabled = enabled;
    }

    // ---- reads (never hit the network) -------------------------------------

    @Transactional(readOnly = true)
    public WeatherResponse current() {
        List<WeatherLog> latest = repo.findAllByOrderByIdDesc(PageRequest.of(0, 1));
        if (latest.isEmpty()) {
            return WeatherResponse.unavailable(
                    "No weather reading yet. Use Refresh to fetch the current conditions.");
        }
        WeatherLog w = latest.get(0);
        String json = w.getForecastJson();
        return new WeatherResponse(
                true, null,
                w.getTempC(),
                // Open-Meteo's apparent temperature is stored inside the JSON blob.
                readDecimal(json, "feelsLikeC"),
                w.getHumidity(),
                w.getRainfallMm(),
                w.getCondition(),
                // Prefer the exact observation timestamp when we have it; fall
                // back to the date, which is all older rows carry.
                firstNonBlank(readText(json, "observedTime"),
                        w.getLogDate() == null ? null : w.getLogDate().toString()),
                w.getSource(),
                readForecast(json),
                readDecimal(json, "windKph"),
                readDecimal(json, "rainProbPct"),
                readHourly(json));
    }

    // The last `hours` of readings. Granularity depends entirely on how often
    // refresh() has run -- this reports what was recorded, it does not
    // interpolate points that were never measured.
    @Transactional(readOnly = true)
    public List<WeatherTrendPoint> trend(int hours) {
        int h = Math.max(1, Math.min(hours, 168));
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays((h / 24) + 1L);
        List<WeatherTrendPoint> out = new ArrayList<>();
        for (WeatherLog w : repo.findByLogDateBetweenOrderByIdAsc(start, end)) {
            String t = readText(w.getForecastJson(), "observedTime");
            out.add(new WeatherTrendPoint(
                    t != null ? t : String.valueOf(w.getLogDate()),
                    w.getTempC(), w.getHumidity()));
        }
        return out;
    }

    // ---- retention ---------------------------------------------------------

    // Shrink yesterday's forecast blobs. Runs daily.
    //
    // WHY SHRINK RATHER THAN DELETE THE ROW: the reading itself -- temperature,
    // humidity, rainfall, condition -- is the estate's weather history, and the
    // yield forecast is meant to learn from exactly that. Throwing rows away
    // would delete the training data for a feature that has not been built yet.
    // Measured on a real row, the blob is 96% of the bytes and the reading is
    // 4%, so shrinking gets essentially all of the saving and loses no history.
    //
    // WHY NOT NULL THE BLOB OUTRIGHT: three things still read it after the day
    // passes. `events()` classifies wind advisories from windKph, `trend()`
    // labels the x-axis from observedTime, and `current()` renders feels-like
    // from feelsLikeC. Nulling the column would silently downgrade an old "Wind
    // advisory / HIGH" row to "NORMAL" -- rewriting recorded history, which is
    // worse than keeping the bytes. So the durable scalars are kept and only
    // the two big arrays go.
    //
    // WHAT IS DROPPED: `hourly` (12 points) and `forecast` (7 days). Both are
    // predictions ABOUT a day that has now passed. Yesterday's forecast of
    // today is not a record of anything; today's reading is.
    @Transactional
    @Scheduled(cron = "${app.weather.prune-cron:0 30 3 * * *}")
    public void pruneForecasts() {
        // Never touch the newest reading, whatever its age. current() renders
        // wind, rain probability and the hourly strip from it -- on an estate
        // that has not refreshed in a week, pruning it would blank the page.
        Long newestId = repo.findAllByOrderByIdDesc(PageRequest.of(0, 1))
                .stream().map(WeatherLog::getId).findFirst().orElse(null);

        List<WeatherLog> old = repo
                .findByLogDateLessThanAndForecastJsonIsNotNullOrderByIdDesc(LocalDate.now());
        int pruned = 0;
        long freed = 0;
        for (WeatherLog w : old) {
            if (w.getId() != null && w.getId().equals(newestId)) {
                continue;
            }
            String before = w.getForecastJson();
            String after = slimBlob(before);
            if (after == null || after.equals(before)) {
                continue; // already slim, or unparseable -- leave it alone
            }
            freed += before.length() - after.length();
            w.setForecastJson(after);
            repo.save(w);
            pruned++;
        }
        if (pruned > 0) {
            log.info("Weather retention: slimmed {} forecast blob(s), freed ~{} bytes. "
                    + "Readings themselves were not deleted.", pruned, freed);
        }
    }

    // Keep the measured scalars, drop the two prediction arrays.
    // Returns null if the blob cannot be parsed, so the caller leaves it be
    // rather than destroying something it did not understand.
    private String slimBlob(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            JsonNode root = mapper.readTree(json);
            if (!root.has("hourly") && !root.has("forecast")) {
                return json; // nothing left to drop
            }
            var slim = mapper.createObjectNode();
            for (String keep : new String[]{"observedTime", "windKph", "rainProbPct", "feelsLikeC"}) {
                if (root.hasNonNull(keep)) {
                    slim.set(keep, root.get(keep));
                }
            }
            return mapper.writeValueAsString(slim);
        } catch (Exception e) {
            return null;
        }
    }

    // ---- activity log ------------------------------------------------------

    // Every reading we hold, newest first, classified by its own numbers.
    //
    // This is a log of MEASUREMENTS, not of incidents somebody typed in. A row
    // appears here because a reading was taken, and its severity is arithmetic
    // on that reading -- nothing here is a human judgement, and nothing is
    // invented. A reading that crossed no threshold is reported as NORMAL
    // rather than dropped, so the log honestly reflects how often the estate
    // was actually sampled.
    @Transactional(readOnly = true)
    public List<WeatherEvent> events(int limit) {
        int n = Math.max(1, Math.min(limit, 200));
        List<WeatherEvent> out = new ArrayList<>();
        for (WeatherLog w : repo.findAllByOrderByIdDesc(PageRequest.of(0, n))) {
            String json = w.getForecastJson();
            BigDecimal wind = readDecimal(json, "windKph");
            out.add(classify(w, wind, readText(json, "observedTime")));
        }
        return out;
    }

    // Thresholds are the ones that change what a supervisor does that morning:
    // whether plucking can go ahead, whether spraying will wash off, whether
    // the drying shed needs ventilating.
    private WeatherEvent classify(WeatherLog w, BigDecimal windKph, String observedTime) {
        BigDecimal rain = w.getRainfallMm();
        BigDecimal hum = w.getHumidity();
        BigDecimal temp = w.getTempC();
        String cond = w.getCondition() == null ? "" : w.getCondition();

        String event = cond.isBlank() ? "Reading recorded" : cond;
        String severity = "NORMAL";
        String detail = "Nothing above threshold.";

        // Ordered by operational impact, most disruptive first -- a reading is
        // reported as the worst thing about it, not a list.
        if (cond.toLowerCase().contains("thunder")) {
            event = "Thunderstorm";
            severity = "HIGH";
            detail = "Thunderstorm reported. Open fields unsafe.";
        } else if (gte(rain, 10)) {
            event = "Heavy rainfall";
            severity = "HIGH";
            detail = rain + " mm recorded.";
        } else if (gte(windKph, 40)) {
            event = "Wind advisory";
            severity = "HIGH";
            detail = windKph + " km/h. Spraying will drift.";
        } else if (gte(temp, 35)) {
            event = "Heat";
            severity = "HIGH";
            detail = temp + "°C. Shorten exposure, water rounds.";
        } else if (gte(hum, 95)) {
            event = "Humidity spike";
            severity = "HIGH";
            detail = hum + "% relative humidity. Withering will stall.";
        } else if (gte(rain, 2.5)) {
            event = "Rainfall";
            severity = "MED";
            detail = rain + " mm recorded.";
        } else if (gte(hum, 90)) {
            event = "Humidity spike";
            severity = "MED";
            detail = hum + "% relative humidity.";
        } else if (gte(windKph, 25)) {
            event = "Breezy";
            severity = "LOW";
            detail = windKph + " km/h.";
        } else if (gte(rain, 0.2)) {
            event = "Light rain";
            severity = "LOW";
            detail = rain + " mm recorded.";
        }

        return new WeatherEvent(
                w.getId(),
                firstNonBlank(observedTime, String.valueOf(w.getLogDate())),
                "Estate central",
                event,
                severity,
                detail,
                temp, hum, rain, windKph);
    }

    private static boolean gte(BigDecimal v, double threshold) {
        return v != null && v.doubleValue() >= threshold;
    }

    // ---- fetch -------------------------------------------------------------

    // Keep the reading current without anyone pressing a button.
    //
    // Hourly by default. Open-Meteo is free, needs no key and publishes no
    // per-hour rate limit at this volume -- 24 calls a day for one coordinate
    // is nothing -- so the cost of being fresh is effectively zero, while the
    // cost of being stale is four features silently reasoning from old numbers.
    //
    // Set app.weather.refresh-cron to change it, or app.weather.enabled=false
    // to stop fetching entirely (refresh() already honours that flag and simply
    // returns the last stored reading).
    //
    // Deliberately swallows everything: a scheduled task that throws gets
    // logged by Spring and, more importantly, this must never become a reason
    // the application looks broken. A missed hour is invisible; the next one
    // fixes it.
    @Scheduled(cron = "${app.weather.refresh-cron:0 5 * * * *}")
    public void scheduledRefresh() {
        if (!enabled) return;
        try {
            refresh();
        } catch (Exception e) {
            log.warn("Scheduled weather refresh failed: {}", e.toString());
        }
    }

    // Pull current conditions + a 3-day forecast and store one row.
    // Returns the stored reading, or the last good one if the fetch failed --
    // weather is never important enough to fail a page over.
    @Transactional
    public WeatherResponse refresh() {
        if (!enabled) {
            return current();
        }
        // wind_speed_10m and the hourly block were added for the Weather Monitor
        // screen. forecast_days is 7 because that screen shows a week; the
        // dashboard card simply reads the first few and is unaffected.
        String url = "https://api.open-meteo.com/v1/forecast"
                + "?latitude=" + latitude
                + "&longitude=" + longitude
                + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,"
                + "precipitation,weather_code,wind_speed_10m"
                + "&hourly=temperature_2m,precipitation_probability,weather_code"
                + "&daily=weather_code,temperature_2m_max,temperature_2m_min"
                + "&past_days=1&forecast_days=7&timezone=auto";
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                log.warn("Weather fetch failed: HTTP {}", resp.statusCode());
                return current();
            }
            JsonNode root = mapper.readTree(resp.body());
            JsonNode cur = root.path("current");

            String observedTime = cur.path("time").asText("");
            var hourly = buildHourly(root.path("hourly"), observedTime);

            var extra = mapper.createObjectNode();
            extra.put("feelsLikeC", cur.path("apparent_temperature").asDouble());
            extra.put("observedTime", observedTime);
            extra.put("windKph", cur.path("wind_speed_10m").asDouble());
            // Open-Meteo reports precipitation probability hourly only, never on
            // the `current` block, so "chance of rain now" is the probability
            // for the hour this reading falls in.
            extra.put("rainProbPct", nowRainProb(root.path("hourly"), observedTime));
            extra.set("hourly", hourly);
            extra.set("forecast", buildForecast(root.path("daily")));

            repo.save(WeatherLog.builder()
                    .logDate(LocalDate.now())
                    .tempC(dec(cur.path("temperature_2m").asDouble()))
                    .humidity(dec(cur.path("relative_humidity_2m").asDouble()))
                    .rainfallMm(dec(cur.path("precipitation").asDouble()))
                    .condition(describe(cur.path("weather_code").asInt(-1)))
                    .source("open-meteo")
                    .forecastJson(mapper.writeValueAsString(extra))
                    .build());

            // Tell open consoles a new reading landed, so a hourly scheduled
            // fetch shows up on a screen someone left open rather than sitting
            // in the table unseen. Only on a SUCCESSFUL fetch -- a failed one
            // stored nothing and there is nothing to look at.
            try {
                notifications.send("Weather updated",
                        "A new reading was recorded.", "weather.saved", null);
            } catch (Exception ignored) {
                // The reading is saved. A dropped frame must not undo it.
            }
        } catch (Exception e) {
            // Includes no internet, DNS failure and timeouts. Degrade to the
            // last stored reading rather than surfacing an error.
            log.warn("Weather fetch failed: {}", e.toString());
        }
        return current();
    }

    // ---- helpers -----------------------------------------------------------

    private com.fasterxml.jackson.databind.node.ArrayNode buildForecast(JsonNode daily) {
        var arr = mapper.createArrayNode();
        JsonNode times = daily.path("time");
        JsonNode codes = daily.path("weather_code");
        JsonNode max = daily.path("temperature_2m_max");
        JsonNode min = daily.path("temperature_2m_min");
        for (int i = 0; i < times.size() && arr.size() < 7; i++) {
            var day = mapper.createObjectNode();
            String iso = times.path(i).asText("");
            day.put("day", shortDay(iso));
            day.put("condition", describe(codes.path(i).asInt(-1)));
            day.put("maxC", max.path(i).asDouble());
            day.put("minC", min.path(i).asDouble());
            arr.add(day);
        }
        return arr;
    }

    // A short window of the hourly forecast around the observation time, so the
    // strip reads "three hours back, now, several ahead" the way someone
    // planning the rest of a shift thinks. Stored trimmed rather than storing
    // all 192 hours Open-Meteo returns.
    private com.fasterxml.jackson.databind.node.ArrayNode buildHourly(JsonNode hourly, String observedTime) {
        var arr = mapper.createArrayNode();
        JsonNode times = hourly.path("time");
        JsonNode temps = hourly.path("temperature_2m");
        JsonNode probs = hourly.path("precipitation_probability");
        JsonNode codes = hourly.path("weather_code");
        int nowIdx = indexOfHour(times, observedTime);
        if (nowIdx < 0) {
            return arr;
        }
        int from = Math.max(0, nowIdx - 3);
        int to = Math.min(times.size() - 1, nowIdx + 8);
        for (int i = from; i <= to; i++) {
            var h = mapper.createObjectNode();
            h.put("time", times.path(i).asText(""));
            h.put("tempC", temps.path(i).asDouble());
            h.put("rainProbPct", probs.path(i).asDouble());
            h.put("condition", describe(codes.path(i).asInt(-1)));
            h.put("now", i == nowIdx);
            arr.add(h);
        }
        return arr;
    }

    // Open-Meteo's `current.time` is minute-precision; the hourly series is on
    // the hour. Match on the "yyyy-MM-ddTHH" prefix rather than equality.
    private static int indexOfHour(JsonNode times, String observedTime) {
        if (observedTime == null || observedTime.length() < 13) {
            return -1;
        }
        String hour = observedTime.substring(0, 13);
        for (int i = 0; i < times.size(); i++) {
            if (times.path(i).asText("").startsWith(hour)) {
                return i;
            }
        }
        return -1;
    }

    private static double nowRainProb(JsonNode hourly, String observedTime) {
        int i = indexOfHour(hourly.path("time"), observedTime);
        return i < 0 ? 0d : hourly.path("precipitation_probability").path(i).asDouble();
    }

    private List<WeatherResponse.HourPoint> readHourly(String json) {
        List<WeatherResponse.HourPoint> out = new ArrayList<>();
        if (json == null || json.isBlank()) {
            return out;
        }
        try {
            for (JsonNode h : mapper.readTree(json).path("hourly")) {
                out.add(new WeatherResponse.HourPoint(
                        h.path("time").asText(""),
                        dec(h.path("tempC").asDouble()),
                        dec(h.path("rainProbPct").asDouble()),
                        h.path("condition").asText(""),
                        h.path("now").asBoolean(false)));
            }
        } catch (Exception ignored) {
            // Readings stored before the hourly block existed simply have none.
        }
        return out;
    }

    private static String firstNonBlank(String a, String b) {
        return (a != null && !a.isBlank()) ? a : b;
    }

    private List<WeatherResponse.ForecastDay> readForecast(String json) {
        List<WeatherResponse.ForecastDay> out = new ArrayList<>();
        if (json == null || json.isBlank()) {
            return out;
        }
        try {
            for (JsonNode d : mapper.readTree(json).path("forecast")) {
                out.add(new WeatherResponse.ForecastDay(
                        d.path("day").asText(""),
                        d.path("condition").asText(""),
                        dec(d.path("minC").asDouble()),
                        dec(d.path("maxC").asDouble())));
            }
        } catch (Exception ignored) {
            // A blob we cannot parse is not worth failing the card for.
        }
        return out;
    }

    private BigDecimal readDecimal(String json, String field) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            JsonNode n = mapper.readTree(json).path(field);
            return n.isMissingNode() || n.isNull() ? null : dec(n.asDouble());
        } catch (Exception ignored) {
            return null;
        }
    }

    private String readText(String json, String field) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            String v = mapper.readTree(json).path(field).asText("");
            return v.isBlank() ? null : v;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static BigDecimal dec(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP);
    }

    private static String shortDay(String iso) {
        try {
            return LocalDate.parse(iso).getDayOfWeek()
                    .getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH);
        } catch (Exception ignored) {
            return iso;
        }
    }

    // WMO weather codes -> plain English. Grouped, because an estate supervisor
    // needs "heavy rain" not "code 65".
    private static String describe(int code) {
        if (code == 0) return "Clear";
        if (code <= 2) return "Partly cloudy";
        if (code == 3) return "Cloudy";
        if (code <= 48) return "Fog";
        if (code <= 55) return "Drizzle";
        if (code <= 65) return "Rain";
        if (code <= 67) return "Freezing rain";
        if (code <= 77) return "Snow";
        if (code <= 82) return "Rain showers";
        if (code <= 86) return "Snow showers";
        if (code <= 99) return "Thunderstorm";
        return "Unknown";
    }
}
