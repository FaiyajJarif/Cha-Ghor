package com.chaghor.chaghor.harvest;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface HarvestScheduleRepository extends JpaRepository<HarvestSchedule, Long> {

    // The board's default view: everything from a given day onwards, soonest
    // first. Cancelled rows are filtered in the service rather than here, so the
    // same query can serve a "show everything" toggle later.
    List<HarvestSchedule> findBySchedDateGreaterThanEqualOrderBySchedDateAscIdAsc(LocalDate from);

    // A window, for the month view and for counting what is planned on a field.
    List<HarvestSchedule> findBySchedDateBetweenOrderBySchedDateAscIdAsc(LocalDate start, LocalDate end);

    List<HarvestSchedule> findByZoneIdOrderBySchedDateDesc(Long zoneId);

    // Replay guard for queued offline creates. See HarvestSchedule.clientUuid.
    java.util.Optional<HarvestSchedule> findFirstByClientUuid(java.util.UUID clientUuid);
}
