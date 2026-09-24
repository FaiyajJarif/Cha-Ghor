package com.chaghor.chaghor.settlement;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

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

    // ========================================================================
    // WORKERS WHO ACTUALLY HAVE UNSETTLED WORK. NOT "workers with no rows".
    // ========================================================================
    //
    // The Payroll banner used to count a worker as "behind" whenever their last
    // settlement was older than yesterday -- INCLUDING a worker who had never
    // been settled at all. That is wrong, and it produced an alarm that could
    // never be cleared:
    //
    //   settleWorker() deliberately writes NO row for a day with zero earnings
    //   ("an absent worker would accumulate a row per day forever for no
    //   reason"). So a worker with no attendance never gets a first row, their
    //   last-settled stays NULL, and they are counted behind permanently. The
    //   admin presses Run settlement, it correctly settles nothing, and the
    //   banner still says their loan balances have not moved. Pressing it again
    //   changes nothing, which is exactly the "clicking it five times" failure
    //   the status endpoint exists to prevent.
    //
    // Behind now means what an admin would mean by it: THEY WORKED AND THE DAY
    // HAS NOT BEEN SETTLED. A day counts as worked if the register says present
    // or late, or if leaf was weighed in -- leaf alone can earn surplus even
    // with no attendance row, and missing that would under-report.
    //
    // Today is excluded, matching settleWorker: today is never settled.
    @Query(value = """
        SELECT COUNT(*) FROM (
            SELECT a.worker_id, a.work_date
              FROM attendance a
             WHERE a.work_date < CURRENT_DATE
               AND a.status::text IN ('present', 'late')
            UNION
            SELECT l.worker_id, l.collect_date
              FROM leaf_collection l
             WHERE l.collect_date < CURRENT_DATE
        ) worked
        JOIN workers w ON w.id = worked.worker_id AND w.deleted_at IS NULL
        WHERE NOT EXISTS (
            SELECT 1 FROM daily_settlement s
             WHERE s.worker_id = worked.worker_id
               AND s.work_date = worked.work_date
               AND s.reversed_at IS NULL)
        """, nativeQuery = true)
    long countUnsettledWorkedDays();

    // The same population, counted as PEOPLE rather than days -- that is what
    // the banner says ("N workers are not settled"), so it must be what the
    // banner counts.
    @Query(value = """
        SELECT COUNT(DISTINCT worked.worker_id) FROM (
            SELECT a.worker_id, a.work_date
              FROM attendance a
             WHERE a.work_date < CURRENT_DATE
               AND a.status::text IN ('present', 'late')
            UNION
            SELECT l.worker_id, l.collect_date
              FROM leaf_collection l
             WHERE l.collect_date < CURRENT_DATE
        ) worked
        JOIN workers w ON w.id = worked.worker_id AND w.deleted_at IS NULL
        WHERE NOT EXISTS (
            SELECT 1 FROM daily_settlement s
             WHERE s.worker_id = worked.worker_id
               AND s.work_date = worked.work_date
               AND s.reversed_at IS NULL)
        """, nativeQuery = true)
    long countWorkersWithUnsettledWork();

    // The oldest worked-but-unsettled day, so the banner can name a date rather
    // than say "some days". NULL when nothing is outstanding.
    @Query(value = """
        SELECT MIN(worked.work_date) FROM (
            SELECT a.worker_id, a.work_date
              FROM attendance a
             WHERE a.work_date < CURRENT_DATE
               AND a.status::text IN ('present', 'late')
            UNION
            SELECT l.worker_id, l.collect_date
              FROM leaf_collection l
             WHERE l.collect_date < CURRENT_DATE
        ) worked
        JOIN workers w ON w.id = worked.worker_id AND w.deleted_at IS NULL
        WHERE NOT EXISTS (
            SELECT 1 FROM daily_settlement s
             WHERE s.worker_id = worked.worker_id
               AND s.work_date = worked.work_date
               AND s.reversed_at IS NULL)
        """, nativeQuery = true)
    LocalDate oldestUnsettledWorkedDay();

    // Every LIVE settled day from `from` onward, oldest first.
    //
    // Needed because the daily split is CHRONOLOGICAL: what day 5 takes for a
    // loan changes what is left for day 6. Correcting day 5 in isolation would
    // leave days 6 onward computed against a balance that no longer exists, so
    // a correction reverses the whole tail and re-settles it in order.
    List<DailySettlement> findByWorkerIdAndWorkDateGreaterThanEqualAndReversedAtIsNullOrderByWorkDateAsc(
            Long workerId, LocalDate from);
}
