package com.chaghor.chaghor.weather;

import com.chaghor.chaghor.weather.dto.WeatherEvent;
import com.chaghor.chaghor.weather.dto.WeatherResponse;
import com.chaghor.chaghor.weather.dto.WeatherTrendPoint;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Weather for the supervisor dashboard.
//
// Reads are open to admin and supervisor. Refresh is a POST because it calls an
// external service and writes a row -- a GET that mutates would get retried by
// browsers and proxies.
@RestController
@RequestMapping("/api/v1/weather")
public class WeatherController {

    private final WeatherService service;
    private final RainImpactService rainImpactService;
    private final WeatherBriefService weatherBriefService;

    public WeatherController(WeatherService service,
                             RainImpactService rainImpactService,
                             WeatherBriefService weatherBriefService) {
        this.service = service;
        this.rainImpactService = rainImpactService;
        this.weatherBriefService = weatherBriefService;
    }

    @GetMapping("/current")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public WeatherResponse current() {
        return service.current();
    }

    @GetMapping("/trend")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<WeatherTrendPoint> trend(@RequestParam(defaultValue = "24") int hours) {
        return service.trend(hours);
    }

    // The activity log. These are recorded readings classified by their own
    // numbers, not incidents anyone typed in -- see WeatherEvent.
    @GetMapping("/events")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<WeatherEvent> events(@RequestParam(defaultValue = "50") int limit) {
        return service.events(limit);
    }

    // Pull a fresh reading now. Safe to call repeatedly: a failed fetch returns
    // the last stored reading instead of an error.
    // What rain actually costs this estate, measured from its own weigh-ins and
    // registers rather than assumed. Returns enoughData=false, and refuses to
    // give a figure, until there are enough matched wet and dry days.
    @GetMapping("/rain-impact")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public com.chaghor.chaghor.weather.dto.RainImpact rainImpact() {
        return rainImpactService.measure();
    }

    // A written note over today's numbers.
    //
    // Deliberately NOT part of /current: it costs a model call, so it happens
    // when a supervisor asks for it rather than every time the page loads. The
    // response carries `error` instead of failing when ai_service is down, and
    // the rest of the screen is unaffected either way.
    // `lang=bn` writes it in Bangla. Defaults to English so an older client
    // that does not send the parameter keeps working unchanged.
    @GetMapping("/brief")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public java.util.Map<String, Object> brief(
            @RequestParam(name = "lang", required = false, defaultValue = "en") String lang) {
        return weatherBriefService.brief(lang);
    }

    @PostMapping("/refresh")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public WeatherResponse refresh() {
        return service.refresh();
    }
}
