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

    public WeatherController(WeatherService service) {
        this.service = service;
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
    @PostMapping("/refresh")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public WeatherResponse refresh() {
        return service.refresh();
    }
}
