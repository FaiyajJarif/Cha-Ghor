package com.chaghor.chaghor.weather;

import com.chaghor.chaghor.weather.dto.WeatherResponse;
import com.chaghor.chaghor.weather.dto.WeatherTrendPoint;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
// weather_log. Fetching is a separate explicit action (refresh(), also driven
// by a schedule), so opening the dashboard can never hang on somebody else's
// server being slow, and a failed fetch degrades to the last good reading
// rather than an error page.
@Service
public class WeatherService {

    private static final Logger log = LoggerFactory.getLogger(WeatherService.class);

    private final WeatherLogRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    private final double latitude;
    private final double longitude;
    private final boolean enabled;

    public WeatherService(WeatherLogRepository repo,
                          @Value("${app.weather.latitude:24.8949}") double latitude,
                          @Value("${app.weather.longitude:91.8687}") double longitude,
                          @Value("${app.weather.enabled:true}") boolean enabled) {
        this.repo = repo;
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
        return new WeatherResponse(
                true, null,
                w.getTempC(),
                // Open-Meteo's apparent temperature is stored inside the JSON blob.
                readDecimal(w.getForecastJson(), "feelsLikeC"),
                w.getHumidity(),
                w.getRainfallMm(),
                w.getCondition(),
                w.getLogDate() == null ? null : w.getLogDate().toString(),
                w.getSource(),
                readForecast(w.getForecastJson()));
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

    // ---- fetch -------------------------------------------------------------

    // Pull current conditions + a 3-day forecast and store one row.
    // Returns the stored reading, or the last good one if the fetch failed --
    // weather is never important enough to fail a page over.
    @Transactional
    public WeatherResponse refresh() {
        if (!enabled) {
            return current();
        }
        String url = "https://api.open-meteo.com/v1/forecast"
                + "?latitude=" + latitude
                + "&longitude=" + longitude
                + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code"
                + "&daily=weather_code,temperature_2m_max,temperature_2m_min"
                + "&past_days=1&forecast_days=4&timezone=auto";
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

            var extra = mapper.createObjectNode();
            extra.put("feelsLikeC", cur.path("apparent_temperature").asDouble());
            extra.put("observedTime", cur.path("time").asText(""));
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
        for (int i = 0; i < times.size() && arr.size() < 4; i++) {
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
