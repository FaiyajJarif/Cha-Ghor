package com.chaghor.chaghor.attendance;

import com.chaghor.chaghor.attendance.dto.AttendanceFlag;
import com.chaghor.chaghor.leaf.LeafCollection;
import com.chaghor.chaghor.leaf.LeafCollectionRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

// Proxy-attendance detection.
//
// WHAT THIS IS: arithmetic over the register, looking for marks whose shape
// does not match a day of work actually happening. No model, no training data,
// nothing learned — every flag is a rule you can read below and argue with.
//
// WHAT THIS IS NOT: an accusation, and the UI must never present it as one.
// Each rule ships with the innocent explanation alongside it, because each rule
// HAS one: pluckers get moved onto pruning and collect nothing, small estates
// really do have days where everyone turns up, and a supervisor whose phone was
// offline legitimately saves the register at nine in the evening.
//
// Nothing here writes to attendance, and nothing here touches pay.
@Service
@RequiredArgsConstructor
public class AttendanceFlagService {

    private final AttendanceRepository attendanceRepository;
    private final LeafCollectionRepository leafRepository;
    private final WorkerRepository workerRepository;
    private final ZoneRepository zoneRepository;

    // A plucker credited with a full day who weighed in nothing at all.
    private static final int MIN_PLUCKERS_FOR_ZERO_LEAF_FLAG = 2;
    // A whole field marked identically, saved in one burst.
    private static final int MIN_ZONE_SIZE_FOR_SWEEP_FLAG = 4;
    private static final long SWEEP_WINDOW_SECONDS = 60;
    // A register saved this long after the working day is worth a look.
    private static final int LATE_SAVE_HOUR = 20;

    @Transactional(readOnly = true)
    public List<AttendanceFlag> flags(LocalDate date) {
        LocalDate d = date != null ? date : LocalDate.now();

        List<Attendance> marks = attendanceRepository.findByWorkDate(d);
        if (marks.isEmpty()) {
            return List.of();
        }

        Map<Long, Worker> workers = new HashMap<>();
        workerRepository.findAll().forEach(w -> workers.put(w.getId(), w));
        Map<Long, String> zoneNames = new HashMap<>();
        zoneRepository.findAll().forEach(z -> zoneNames.put(z.getId(), z.getName()));

        // Kilos weighed in per worker for the day.
        Map<Long, BigDecimal> kg = new HashMap<>();
        for (LeafCollection lc : leafRepository.findByCollectDateOrderByIdDesc(d)) {
            kg.merge(lc.getWorkerId(),
                    lc.getWeightKg() == null ? BigDecimal.ZERO : lc.getWeightKg(),
                    BigDecimal::add);
        }

        List<AttendanceFlag> out = new ArrayList<>();
        out.addAll(presentButNoLeaf(marks, workers, zoneNames, kg, d));
        out.addAll(identicalSweep(marks, workers, zoneNames, d));
        out.addAll(savedLongAfterTheDay(marks, workers, zoneNames, d));
        out.addAll(unfamiliarField(marks, workers, zoneNames, d));
        return out;
    }

    // RULE 1 — paid for a day of plucking, weighed in nothing.
    //
    // This is the strongest signal available without new hardware, because the
    // leaf register is written by a different person at a different moment: to
    // fake it you would have to fake both.
    private List<AttendanceFlag> presentButNoLeaf(List<Attendance> marks, Map<Long, Worker> workers,
                                                  Map<Long, String> zoneNames,
                                                  Map<Long, BigDecimal> kg, LocalDate d) {
        // Only meaningful if the estate weighed leaf at all that day. On a
        // rest day or a rained-off day nobody collects anything and flagging
        // the entire workforce would be noise, not signal.
        if (kg.isEmpty()) {
            return List.of();
        }
        List<AttendanceFlag.Named> hits = new ArrayList<>();
        Long zoneId = null;
        for (Attendance a : marks) {
            if (a.getStatus() != AttendanceStatus.present && a.getStatus() != AttendanceStatus.late) {
                continue;
            }
            Worker w = workers.get(a.getWorkerId());
            if (w == null || !"plucker".equalsIgnoreCase(String.valueOf(w.getJobRole()))) {
                continue; // only pluckers are expected to produce leaf
            }
            BigDecimal collected = kg.get(a.getWorkerId());
            if (collected == null || collected.signum() == 0) {
                hits.add(new AttendanceFlag.Named(w.getId(), w.getFullName()));
                if (zoneId == null) zoneId = a.getZoneId();
            }
        }
        if (hits.size() < MIN_PLUCKERS_FOR_ZERO_LEAF_FLAG) {
            return List.of();
        }
        return List.of(new AttendanceFlag(
                "present_no_leaf",
                "Marked present, no leaf weighed in",
                hits.size() >= 5 ? "HIGH" : "MED",
                d, zoneId, zoneNames.get(zoneId), hits,
                hits.size() + " plucker" + (hits.size() == 1 ? " was" : "s were")
                        + " credited with a working day but weighed in 0 kg, on a day when "
                        + kg.size() + " other worker" + (kg.size() == 1 ? "" : "s") + " did.",
                "They may have been moved onto pruning, weeding or repairs, or their "
                        + "weigh-in may simply not have been entered yet."));
    }

    // RULE 2 — a whole field marked identically, all saved within a minute.
    //
    // Marking a real field means walking it, so the timestamps spread out. A
    // block of identical marks written in one burst is the signature of someone
    // filling the sheet in from memory at a desk.
    private List<AttendanceFlag> identicalSweep(List<Attendance> marks, Map<Long, Worker> workers,
                                                Map<Long, String> zoneNames, LocalDate d) {
        Map<Long, List<Attendance>> byZone = new HashMap<>();
        for (Attendance a : marks) {
            if (a.getZoneId() == null || a.getMarkedAt() == null) continue;
            byZone.computeIfAbsent(a.getZoneId(), k -> new ArrayList<>()).add(a);
        }
        List<AttendanceFlag> out = new ArrayList<>();
        for (Map.Entry<Long, List<Attendance>> e : byZone.entrySet()) {
            List<Attendance> rows = e.getValue();
            if (rows.size() < MIN_ZONE_SIZE_FOR_SWEEP_FLAG) continue;

            boolean allSame = rows.stream().map(Attendance::getStatus).distinct().count() == 1;
            if (!allSame || rows.get(0).getStatus() != AttendanceStatus.present) continue;

            OffsetDateTime min = rows.stream().map(Attendance::getMarkedAt).min(OffsetDateTime::compareTo).get();
            OffsetDateTime max = rows.stream().map(Attendance::getMarkedAt).max(OffsetDateTime::compareTo).get();
            long spread = Duration.between(min, max).getSeconds();
            if (spread > SWEEP_WINDOW_SECONDS) continue;

            List<AttendanceFlag.Named> named = rows.stream()
                    .map(a -> workers.get(a.getWorkerId()))
                    .filter(w -> w != null)
                    .map(w -> new AttendanceFlag.Named(w.getId(), w.getFullName()))
                    .toList();

            out.add(new AttendanceFlag(
                    "identical_sweep",
                    "Whole field marked present in one go",
                    "MED", d, e.getKey(), zoneNames.get(e.getKey()), named,
                    "All " + rows.size() + " workers in this field were marked present within "
                            + spread + " seconds of each other.",
                    "Using “Mark all present” does exactly this, and is perfectly "
                            + "normal on a day when everyone did turn up."));
        }
        return out;
    }

    // RULE 3 — the register was saved well after the working day ended.
    private List<AttendanceFlag> savedLongAfterTheDay(List<Attendance> marks, Map<Long, Worker> workers,
                                                      Map<Long, String> zoneNames, LocalDate d) {
        List<AttendanceFlag.Named> hits = new ArrayList<>();
        for (Attendance a : marks) {
            if (a.getMarkedAt() == null) continue;
            boolean sameDay = a.getMarkedAt().toLocalDate().isEqual(d);
            boolean lateInDay = a.getMarkedAt().getHour() >= LATE_SAVE_HOUR;
            if ((sameDay && lateInDay) || a.getMarkedAt().toLocalDate().isAfter(d)) {
                Worker w = workers.get(a.getWorkerId());
                if (w != null) hits.add(new AttendanceFlag.Named(w.getId(), w.getFullName()));
            }
        }
        if (hits.isEmpty()) return List.of();
        return List.of(new AttendanceFlag(
                "late_entry",
                "Register filled in after the working day",
                "LOW", d, null, null, hits,
                hits.size() + " mark" + (hits.size() == 1 ? " was" : "s were")
                        + " saved after " + LATE_SAVE_HOUR + ":00 or on a later date.",
                "A phone that was out of signal all day syncs the moment it reconnects, "
                        + "which produces exactly this and is the system working as intended."));
    }

    // RULE 4 — present in a field this worker has never worked before.
    private List<AttendanceFlag> unfamiliarField(List<Attendance> marks, Map<Long, Worker> workers,
                                                 Map<Long, String> zoneNames, LocalDate d) {
        // What each worker has done in the 60 days before this one.
        Map<Long, Set<Long>> historyByWorker = new HashMap<>();
        for (Attendance a : attendanceRepository.findByWorkDateBetween(d.minusDays(60), d.minusDays(1))) {
            if (a.getZoneId() == null) continue;
            historyByWorker.computeIfAbsent(a.getWorkerId(), k -> new HashSet<>()).add(a.getZoneId());
        }
        if (historyByWorker.isEmpty()) {
            return List.of(); // a new estate has no history to be unfamiliar with
        }
        Map<Long, List<AttendanceFlag.Named>> byZone = new HashMap<>();
        for (Attendance a : marks) {
            if (a.getZoneId() == null) continue;
            if (a.getStatus() != AttendanceStatus.present && a.getStatus() != AttendanceStatus.late) continue;
            Set<Long> seen = historyByWorker.get(a.getWorkerId());
            if (seen == null || seen.isEmpty()) continue; // no history for this worker
            if (seen.contains(a.getZoneId())) continue;
            Worker w = workers.get(a.getWorkerId());
            if (w == null) continue;
            byZone.computeIfAbsent(a.getZoneId(), k -> new ArrayList<>())
                    .add(new AttendanceFlag.Named(w.getId(), w.getFullName()));
        }
        List<AttendanceFlag> out = new ArrayList<>();
        for (Map.Entry<Long, List<AttendanceFlag.Named>> e : byZone.entrySet()) {
            out.add(new AttendanceFlag(
                    "unfamiliar_field",
                    "Working a field they have not worked before",
                    "LOW", d, e.getKey(), zoneNames.get(e.getKey()), e.getValue(),
                    e.getValue().size() + " worker" + (e.getValue().size() == 1 ? " has" : "s have")
                            + " no record of working this field in the last 60 days.",
                    "Reassigning people between fields is routine, and this is expected "
                            + "whenever someone is moved to cover a shortage."));
        }
        return out;
    }
}
