package com.chaghor.chaghor.settlement;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DailySettlementRepository extends JpaRepository<DailySettlement, Long> {

    // "Has this day already been settled?" -- the guard that stops a second
    // deduction. Backed by the unique constraint, not relying on it alone.
    Optional<DailySettlement> findByWorkerIdAndWorkDate(Long workerId, LocalDate workDate);

    // THE LIVE ROW FOR A DAY. Everything that decides whether a day still needs
    // settling must use this, not the plain finder above -- a reversed row is
    // history, and treating it as "already settled" would leave a corrected day
    // permanently unsettled.
    Optional<DailySettlement> findByWorkerIdAndWorkDateAndReversedAtIsNull(
            Long workerId, LocalDate workDate);

    // Where to resume from. Ignores reversed rows for the same reason.
    Optional<DailySettlement> findFirstByWorkerIdAndReversedAtIsNullOrderByWorkDateDesc(
            Long workerId);

    List<DailySettlement> findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(
            Long workerId, LocalDate from, LocalDate to);

    // The last day settled, so the next run knows where to resume.
    Optional<DailySettlement> findFirstByWorkerIdOrderByWorkDateDesc(Long workerId);

    List<DailySettlement> findByWorkDate(LocalDate workDate);

    // Every LIVE settled day from `from` onward, oldest first.
    //
    // Needed because the daily split is CHRONOLOGICAL: what day 5 takes for a
    // loan changes what is left for day 6. Correcting day 5 in isolation would
    // leave days 6 onward computed against a balance that no longer exists, so
    // a correction reverses the whole tail and re-settles it in order.
    List<DailySettlement> findByWorkerIdAndWorkDateGreaterThanEqualAndReversedAtIsNullOrderByWorkDateAsc(
            Long workerId, LocalDate from);
}
