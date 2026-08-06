package com.chaghor.chaghor.attendance;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface AttendanceRepository extends JpaRepository<Attendance, Long> {

    // All rows for a given day (used to prefill the attendance sheet).
    List<Attendance> findByWorkDate(LocalDate workDate);

    // Used for the upsert: find an existing mark for this worker on this day.
    Optional<Attendance> findByWorkerIdAndWorkDate(Long workerId, LocalDate workDate);

    // Present-day count for a worker within an (inclusive) date range. This is
    // the input to payroll base pay: base = presentDays x daily wage.
    long countByWorkerIdAndWorkDateBetweenAndStatus(
            Long workerId, LocalDate start, LocalDate end, AttendanceStatus status);
}
