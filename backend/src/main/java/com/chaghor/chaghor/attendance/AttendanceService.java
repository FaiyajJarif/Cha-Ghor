package com.chaghor.chaghor.attendance;

import com.chaghor.chaghor.attendance.dto.AttendanceBulkRequest;
import com.chaghor.chaghor.attendance.dto.AttendanceEntryRequest;
import com.chaghor.chaghor.attendance.dto.AttendanceResponse;
import com.chaghor.chaghor.attendance.dto.AttendanceSummaryResponse;
import com.chaghor.chaghor.attendance.dto.AttendanceTrendPoint;
import com.chaghor.chaghor.attendance.dto.WorkerMonthResponse;
import com.chaghor.chaghor.zone.ZoneRepository;
import com.chaghor.chaghor.audit.AuditService;
import com.chaghor.chaghor.notification.NotificationService;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AttendanceService {

    private final AttendanceRepository attendanceRepository;
    private final WorkerRepository workerRepository;
    private final UserRepository userRepository;
    // Attendance feeds base pay, so every change to a saved mark is recorded.
    // Flipping someone to absent on payday must not be untraceable.
    private final AuditService auditService;
    // Live push, so an admin watching the register sees a supervisor's marks
    // arrive without reloading.
    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(AttendanceService.class);

    private final NotificationService notifications;
    private final com.chaghor.chaghor.settlement.SettlementRevisionService revisionService;
    private final ZoneRepository zoneRepository;

    // Existing marks for a day, so the sheet can prefill what was already saved.
    @Transactional(readOnly = true)
    public List<AttendanceResponse> listByDate(LocalDate date) {
        LocalDate d = (date != null) ? date : LocalDate.now();
        List<AttendanceResponse> out = new ArrayList<>();
        for (Attendance a : attendanceRepository.findByWorkDate(d)) {
            out.add(AttendanceResponse.applied(a.getWorkerId(), a.getWorkDate(),
                    a.getStatus().name(), a.getZoneId(), a.getLateMinutes()));
        }
        return out;
    }

    // One day's counts, for the supervisor dashboard KPI card.
    //
    // `marked` is reported alongside the percentage on purpose: a register
    // nobody has filled in and a day where everyone was absent both produce
    // 0% present, and the UI has to be able to tell them apart.
    @Transactional(readOnly = true)
    public AttendanceSummaryResponse summary(LocalDate date) {
        LocalDate d = (date != null) ? date : LocalDate.now();
        long present = 0, absent = 0, late = 0, onLeave = 0;
        for (Attendance a : attendanceRepository.findByWorkDate(d)) {
            switch (a.getStatus()) {
                case present -> present++;
                case absent -> absent++;
                case late -> late++;
                case leave -> onLeave++;
            }
        }
        long marked = present + absent + late + onLeave;
        // Denominator is the live workforce, not the rows marked -- otherwise
        // marking a single present worker reads as 100% attendance.
        long activeWorkers = workerRepository.findByDeletedAtIsNull().stream()
                .filter(w -> "active".equalsIgnoreCase(w.getStatus()))
                .count();
        double pct = activeWorkers > 0
                ? Math.round((present * 1000.0) / activeWorkers) / 10.0
                : 0.0;
        return new AttendanceSummaryResponse(d, activeWorkers, marked, present, absent, late, onLeave, pct);
    }

    // Per-day counts for the trend chart, oldest first. Days with no register
    // are returned as zeros rather than omitted, so the chart keeps an even
    // x-axis instead of silently collapsing gaps.
    @Transactional(readOnly = true)
    public List<AttendanceTrendPoint> trend(int days) {
        int n = Math.max(1, Math.min(days, 60));
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(n - 1L);

        Map<LocalDate, long[]> byDay = new HashMap<>();
        for (Attendance a : attendanceRepository.findByWorkDateBetween(start, end)) {
            long[] c = byDay.computeIfAbsent(a.getWorkDate(), k -> new long[4]);
            switch (a.getStatus()) {
                case present -> c[0]++;
                case absent -> c[1]++;
                case late -> c[2]++;
                case leave -> c[3]++;
            }
        }
        List<AttendanceTrendPoint> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            LocalDate d = start.plusDays(i);
            long[] c = byDay.getOrDefault(d, new long[4]);
            out.add(new AttendanceTrendPoint(
                    d,
                    d.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.ENGLISH),
                    c[0], c[1], c[2], c[3]));
        }
        return out;
    }

    // Upsert every entry for the given date. Because of UNIQUE(worker_id,
    // work_date) we update the existing row when there is one, else insert.
    @Transactional
    public List<AttendanceResponse> bulkUpsert(AttendanceBulkRequest req, String markedByUsername) {
        if (req == null || req.date() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A date is required");
        }
        if (req.entries() == null || req.entries().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No attendance entries were provided");
        }
        Long markedBy = (markedByUsername == null)
                ? null
                : userRepository.findByUsername(markedByUsername).map(u -> u.getId()).orElse(null);

        List<AttendanceResponse> out = new ArrayList<>();
        int changed = 0;
        // Only the workers whose mark actually moved. A no-op re-save must not
        // trigger a reversal of balances that are already correct.
        java.util.Set<Long> revised = new java.util.LinkedHashSet<>();
        for (AttendanceEntryRequest e : req.entries()) {
            if (e.workerId() == null) {
                continue;
            }
            Worker worker = workerRepository.findById(e.workerId()).orElse(null);
            if (worker == null) {
                continue; // skip unknown workers instead of failing the whole batch
            }
            AttendanceStatus status = parseStatus(e.status());

            // A mark with no timestamp is happening now -- true for any online
            // save. Only a replayed offline write carries an older one.
            OffsetDateTime markedAt = e.markedAt() != null ? e.markedAt() : OffsetDateTime.now();

            Attendance existing = attendanceRepository
                    .findByWorkerIdAndWorkDate(e.workerId(), req.date())
                    .orElse(null);

            // --- idempotency -------------------------------------------------
            // The same queued write arriving twice is not a second edit. Answer
            // as though it succeeded, because from the handset's point of view
            // it did, and let it clear the entry from its outbox.
            if (existing != null && e.clientUuid() != null
                    && e.clientUuid().equals(existing.getClientUuid())) {
                out.add(AttendanceResponse.applied(existing.getWorkerId(), existing.getWorkDate(),
                        existing.getStatus().name(), existing.getZoneId(), existing.getLateMinutes()));
                continue;
            }

            // --- conflict ----------------------------------------------------
            // Newest mark wins. A handset that reconnects in the evening still
            // holding the morning's mark must not overwrite a correction made
            // in the office at midday. Equal timestamps fall through and the
            // incoming write applies, so an online re-save still works.
            if (existing != null && existing.getMarkedAt() != null
                    && existing.getMarkedAt().isAfter(markedAt)) {
                out.add(AttendanceResponse.skipped(existing.getWorkerId(), existing.getWorkDate(),
                        existing.getStatus().name(), existing.getZoneId(), existing.getLateMinutes(),
                        "A newer mark for this worker was already saved, so this older one was not applied."));
                continue;
            }

            Attendance a = existing != null ? existing : new Attendance();
            Map<String, Object> before = (existing == null) ? null : AuditService.details(
                    "status", existing.getStatus() == null ? null : existing.getStatus().name(),
                    "zoneId", existing.getZoneId(),
                    "lateMinutes", existing.getLateMinutes());

            a.setWorkerId(e.workerId());
            a.setWorkDate(req.date());
            a.setStatus(status);
            // Per-day field assignment: use the zone the supervisor picked for
            // this shift, falling back to the worker's home zone. Before this,
            // attendance.zone_id could only ever hold the home zone, so moving
            // a plucker to another field for a day was unrecordable.
            a.setZoneId(e.zoneId() != null ? e.zoneId() : worker.getZoneId());
            // Lateness belongs only to a late row. Clearing it otherwise stops a
            // stale "45 minutes late" surviving a correction to present.
            a.setLateMinutes(status == AttendanceStatus.late ? e.lateMinutes() : null);
            a.setMarkedBy(markedBy);
            a.setMarkedAt(markedAt);
            if (e.clientUuid() != null) {
                a.setClientUuid(e.clientUuid());
            }
            attendanceRepository.save(a);
            changed++;
            revised.add(a.getWorkerId());

            Map<String, Object> after = AuditService.details(
                    "status", a.getStatus().name(),
                    "zoneId", a.getZoneId(),
                    "lateMinutes", a.getLateMinutes(),
                    "workDate", a.getWorkDate().toString(),
                    "offlineReplay", e.markedAt() != null);
            auditService.record(existing == null ? "attendance.mark" : "attendance.amend",
                    "attendance", a.getId(), before, after);

            out.add(AttendanceResponse.applied(a.getWorkerId(), a.getWorkDate(),
                    a.getStatus().name(), a.getZoneId(), a.getLateMinutes()));
        }

        // A DAY THAT WAS ALREADY SETTLED HAS TO BE UNWOUND, NOT JUST OVERWRITTEN.
        //
        // Marking someone absent who was settled as present means the estate has
        // already recovered a loan instalment against earnings that no longer
        // exist. Only the workers actually touched are revised -- re-settling
        // the whole register because one mark changed would churn every balance
        // on the estate.
        //
        // Swallowed per worker: the register save has already committed, and a
        // failure here must not take the supervisor's marks down with it.
        for (Long touched : revised) {
            try {
                revisionService.onDayChanged(touched, req.date(),
                        "Attendance amended for " + req.date());
            } catch (Exception e) {
                log.error("[attendance] settlement revision failed for worker {} on {}: {}",
                        touched, req.date(), e.toString());
            }
        }

        // One frame for the batch, not one per worker -- marking 200 people
        // should not fire 200 refreshes at every open console.
        if (changed > 0) {
            try {
                notifications.send("Attendance updated",
                        changed + (changed == 1 ? " mark" : " marks") + " saved for " + req.date(),
                        "attendance.saved", null);
            } catch (Exception ignored) {
                // Never let a dropped frame fail a save that already committed.
            }
        }
        return out;
    }

    private AttendanceStatus parseStatus(String s) {
        if (s == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing status");
        }
        try {
            return AttendanceStatus.valueOf(s.trim().toLowerCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + s);
        }
    }

    // ---- one worker, one month ---------------------------------------------

    // "How many days was he present this month?"
    //
    // Counts come from rows that exist. Days with no row are reported as
    // `notMarked` rather than folded into `absent`, because an unfilled
    // register is a different problem from a worker who did not come -- and it
    // is the one that silently costs someone their wage, since payroll only
    // ever counts rows.
    @Transactional(readOnly = true)
    public WorkerMonthResponse workerMonth(Long workerId, String month) {
        Worker w = workerRepository.findById(workerId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "That worker could not be found."));

        YearMonth ym;
        try {
            ym = (month == null || month.isBlank()) ? YearMonth.now() : YearMonth.parse(month.trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Month must be written as yyyy-MM, for example 2026-08.");
        }
        LocalDate from = ym.atDay(1);
        LocalDate to = ym.atEndOfMonth();

        Map<Long, String> zones = new HashMap<>();
        zoneRepository.findAll().forEach(z -> zones.put(z.getId(), z.getName()));

        long present = 0, late = 0, absent = 0, onLeave = 0, lateMinutes = 0;
        List<WorkerMonthResponse.Day> days = new ArrayList<>();
        for (Attendance a : attendanceRepository
                .findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(workerId, from, to)) {
            switch (a.getStatus()) {
                case present -> present++;
                case late -> {
                    late++;
                    lateMinutes += a.getLateMinutes() == null ? 0 : a.getLateMinutes();
                }
                case absent -> absent++;
                case leave -> onLeave++;
            }
            days.add(new WorkerMonthResponse.Day(a.getWorkDate(), a.getStatus().name(),
                    a.getZoneId(), zones.get(a.getZoneId()), a.getLateMinutes()));
        }

        long marked = days.size();
        // Only count days that have actually happened. A month in progress
        // should not report 20 unmarked days that are still in the future.
        LocalDate today = LocalDate.now();
        LocalDate lastCountable = to.isAfter(today) ? today : to;
        long elapsed = lastCountable.isBefore(from) ? 0
                : (lastCountable.toEpochDay() - from.toEpochDay() + 1);
        long notMarked = Math.max(0, elapsed - marked);

        // present + late — exactly what PayrollService pays base wage on, so
        // this screen and the payslip cannot disagree.
        long payable = present + late;
        double pct = elapsed == 0 ? 0.0 : Math.round(payable * 1000.0 / elapsed) / 10.0;

        return new WorkerMonthResponse(
                w.getId(), w.getFullName(), ym.toString(), from, to,
                present, late, absent, onLeave, marked, notMarked, payable, lateMinutes, pct, days);
    }
}
