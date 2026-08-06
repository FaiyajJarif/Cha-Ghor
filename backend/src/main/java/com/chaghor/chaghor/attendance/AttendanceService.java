package com.chaghor.chaghor.attendance;

import com.chaghor.chaghor.attendance.dto.AttendanceBulkRequest;
import com.chaghor.chaghor.attendance.dto.AttendanceEntryRequest;
import com.chaghor.chaghor.attendance.dto.AttendanceResponse;
import com.chaghor.chaghor.attendance.dto.AttendanceSummaryResponse;
import com.chaghor.chaghor.attendance.dto.AttendanceTrendPoint;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
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

    // Existing marks for a day, so the sheet can prefill what was already saved.
    @Transactional(readOnly = true)
    public List<AttendanceResponse> listByDate(LocalDate date) {
        LocalDate d = (date != null) ? date : LocalDate.now();
        List<AttendanceResponse> out = new ArrayList<>();
        for (Attendance a : attendanceRepository.findByWorkDate(d)) {
            out.add(new AttendanceResponse(a.getWorkerId(), a.getWorkDate(), a.getStatus().name(), a.getZoneId()));
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
        for (AttendanceEntryRequest e : req.entries()) {
            if (e.workerId() == null) {
                continue;
            }
            Worker worker = workerRepository.findById(e.workerId()).orElse(null);
            if (worker == null) {
                continue; // skip unknown workers instead of failing the whole batch
            }
            AttendanceStatus status = parseStatus(e.status());
            Attendance a = attendanceRepository.findByWorkerIdAndWorkDate(e.workerId(), req.date())
                    .orElseGet(Attendance::new);
            a.setWorkerId(e.workerId());
            a.setWorkDate(req.date());
            a.setStatus(status);
            // Per-day field assignment: use the zone the supervisor picked for
            // this shift, falling back to the worker's home zone. Before this,
            // attendance.zone_id could only ever hold the home zone, so moving
            // a plucker to another field for a day was unrecordable.
            a.setZoneId(e.zoneId() != null ? e.zoneId() : worker.getZoneId());
            a.setMarkedBy(markedBy);
            attendanceRepository.save(a);
            out.add(new AttendanceResponse(a.getWorkerId(), a.getWorkDate(), a.getStatus().name(), a.getZoneId()));
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
}
