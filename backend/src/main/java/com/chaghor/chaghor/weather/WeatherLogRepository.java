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
}
