package com.chaghor.chaghor.weather;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface WeatherLogRepository extends JpaRepository<WeatherLog, Long> {

    // Most recent reading first. Pageable so the caller can ask for just one.
    List<WeatherLog> findAllByOrderByIdDesc(Pageable pageable);

    // Readings across a date range, oldest first, for the trend curve.
    List<WeatherLog> findByLogDateBetweenOrderByIdAsc(LocalDate start, LocalDate end);

    // Candidates for forecast-blob pruning: readings from before `cutoff` that
    // still carry a stored blob. Ordered so the newest is first, which lets the
    // caller spare the most recent reading -- see WeatherService.pruneForecasts.
    List<WeatherLog> findByLogDateLessThanAndForecastJsonIsNotNullOrderByIdDesc(LocalDate cutoff);
}
