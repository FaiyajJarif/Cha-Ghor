package com.chaghor.chaghor.leaf;

import com.chaghor.chaghor.audit.AuditService;
import com.chaghor.chaghor.notification.NotificationService;
import com.chaghor.chaghor.leaf.dto.LeafRecordRequest;
import com.chaghor.chaghor.leaf.dto.LeafResponse;
import com.chaghor.chaghor.leaf.dto.LeafSummaryResponse;
import com.chaghor.chaghor.leaf.dto.LeafTrendPoint;
import com.chaghor.chaghor.leaf.dto.TopPlucker;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import com.chaghor.chaghor.leaf.dto.ZonePerformance;
import com.chaghor.chaghor.leaf.dto.YieldForecast;
import org.springframework.data.domain.PageRequest;
import java.util.List;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;
import java.util.Map;

// Green-leaf collection module. Records how much leaf each worker brought in
// per day and lists it back for the day sheet + a small summary card. Quality
// grading is demo-tier AI, so grade is optional and set manually when provided.
@Service
@RequiredArgsConstructor
public class LeafCollectionService {

    // How far back the "usual for this field" figure looks. Two weeks is long
    // enough to smooth a bad day and short enough to follow the season.
    private static final int NORM_WINDOW_DAYS = 14;
    // Thresholds for colouring the map. Deliberately wide: normal picking
    // varies a lot day to day, and a map that flashes red constantly gets
    // ignored.
    private static final double GOOD_PCT = 15.0;
    private static final double LOW_PCT = -20.0;
    // Forecast window. Short on purpose: tea flushes change week to week, so a
    // long average smooths away the thing you are trying to see.
    private static final int FORECAST_WINDOW_DAYS = 10;

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(LeafCollectionService.class);

    private final LeafCollectionRepository repo;
    private final WorkerRepository workerRepository;
    private final ZoneRepository zoneRepository;
    private final UserRepository userRepository;
    private final com.chaghor.chaghor.attendance.AttendanceRepository attendanceRepository;
    private final com.chaghor.chaghor.weather.WeatherLogRepository weatherLogRepository;
    // Turns the forecast's invented rain factor into a measured one. Depends on
    // the leaf REPOSITORY, not this service, so there is no circular bean.
    private final com.chaghor.chaghor.weather.RainImpactService rainImpactService;
    private final com.chaghor.chaghor.vision.VisionInferenceRepository visionRepository;
    // Leaf weight feeds the payroll surplus, so every correction is traceable.
    private final AuditService auditService;
    private final NotificationService notifications;
    private final com.chaghor.chaghor.settlement.SettlementRevisionService revisionService;

    @Transactional
    public LeafResponse record(LeafRecordRequest req, String recordedByUsername) {
        if (req == null || req.workerId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "workerId is required");
        }
        Worker worker = workerRepository.findById(req.workerId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Worker not found"));

        BigDecimal weight = (req.weightKg() == null) ? BigDecimal.ZERO : req.weightKg();
        if (weight.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "weightKg cannot be negative");
        }

        // A replayed queued weigh-in is not a second bucket of leaf. Answer as
        // though it succeeded so the handset clears its outbox, but do NOT
        // insert again -- these kilos become wages.
        if (req.clientUuid() != null) {
            var existing = repo.findFirstByClientUuid(req.clientUuid());
            if (existing.isPresent()) {
                return toResponse(existing.get(), worker);
            }
        }

        Long recordedBy = (recordedByUsername == null)
                ? null
                : userRepository.findByUsername(recordedByUsername).map(u -> u.getId()).orElse(null);

        LeafCollection lc = LeafCollection.builder()
                .workerId(worker.getId())
                // Which field this leaf came from: the one the supervisor
                // picked, else the worker's home zone.
                .zoneId(req.zoneId() != null ? req.zoneId() : worker.getZoneId())
                .collectDate(req.date() != null ? req.date() : LocalDate.now())
                .weightKg(weight)
                .qualityGrade(parseGrade(req.grade()))
                .recordedBy(recordedBy)
                .clientUuid(req.clientUuid())
                .photoId(req.photoId())
                .build();
        repo.save(lc);
        audit("leaf.record", lc.getId(), null, snapshot(lc));
        pushChanged(lc.getCollectDate());
        // A NEW weigh-in can land on a day that is ALREADY SETTLED -- leaf
        // brought in late, or a sack found the next morning. That day is now
        // worth more than the estate recorded, and the worker is owed the
        // difference. Only update and delete were hooked at first, which left
        // exactly this case moving nothing.
        reviseIfSettled(lc.getWorkerId(), lc.getCollectDate(), "Weigh-in added after settlement");
        return toResponse(lc, worker);
    }

    // ---- correcting a weigh-in ---------------------------------------------

    // Amend a weight, grade or field.
    //
    // This exists because a mistyped weight was previously permanent, and the
    // number feeds the payroll surplus directly -- a slipped decimal at the
    // scale became a wrong wage with no way back. Every amendment is audited
    // with its before and after.
    @Transactional
    public LeafResponse update(Long id, LeafRecordRequest req, String username) {
        LeafCollection lc = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "That weigh-in could not be found."));
        Map<String, Object> before = snapshot(lc);

        if (req.weightKg() != null) {
            if (req.weightKg().signum() < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "weightKg cannot be negative");
            }
            lc.setWeightKg(req.weightKg());
        }
        if (req.grade() != null && !req.grade().isBlank()) {
            lc.setQualityGrade(parseGrade(req.grade()));
        }
        if (req.zoneId() != null) {
            lc.setZoneId(req.zoneId());
        }
        if (req.date() != null) {
            lc.setCollectDate(req.date());
        }
        if (req.photoId() != null) {
            lc.setPhotoId(req.photoId());
        }
        repo.save(lc);
        audit("leaf.amend", lc.getId(), before, snapshot(lc));
        pushChanged(lc.getCollectDate());
        // If the old date differs from the new one, BOTH days changed: the day
        // the kilos left and the day they landed on.
        Object wasDate = before.get("date");
        if (wasDate != null && !wasDate.toString().equals(String.valueOf(lc.getCollectDate()))) {
            reviseIfSettled(lc.getWorkerId(), LocalDate.parse(wasDate.toString()),
                    "Weigh-in moved to another day");
        }
        reviseIfSettled(lc.getWorkerId(), lc.getCollectDate(), "Weigh-in corrected");
        return toResponse(lc, workerRepository.findById(lc.getWorkerId()).orElse(null));
    }

    // Remove a weigh-in that should never have been recorded -- a double entry,
    // or leaf logged against the wrong worker.
    //
    // A real delete, not an archive: unlike a zone, a weigh-in row is not
    // referenced by anything else, so removing it destroys no history beyond
    // itself. The audit trail keeps what it was, which is the part that must
    // survive when money is involved.
    @Transactional
    public void delete(Long id) {
        LeafCollection lc = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "That weigh-in could not be found."));
        Map<String, Object> before = snapshot(lc);
        LocalDate d = lc.getCollectDate();
        Long owner = lc.getWorkerId();
        repo.delete(lc);
        audit("leaf.delete", id, before, null);
        pushChanged(d);
        reviseIfSettled(owner, d, "Weigh-in deleted");
    }

    // A CORRECTION MUST NEVER COST THE SUPERVISOR HIS EDIT.
    //
    // If the day was already settled, real balances moved and have to be undone
    // before the day can be recomputed. That work runs in its own transaction
    // and is swallowed here on purpose: the corrected weight is the thing the
    // supervisor came to record, and losing it to protect the accounting would
    // be exactly backwards. A failure is logged loudly and the day shows up in
    // "workers behind" on the Payroll card.
    private void reviseIfSettled(Long workerId, LocalDate date, String reason) {
        if (workerId == null || date == null) {
            return;
        }
        try {
            revisionService.onDayChanged(workerId, date, reason);
        } catch (Exception e) {
            log.error("[leaf] settlement revision failed for worker {} on {}: {}",
                    workerId, date, e.toString());
        }
    }

    private Map<String, Object> snapshot(LeafCollection lc) {
        return AuditService.details(
                "workerId", lc.getWorkerId(),
                "date", lc.getCollectDate() == null ? null : lc.getCollectDate().toString(),
                "weightKg", lc.getWeightKg() == null ? null : lc.getWeightKg().toPlainString(),
                "grade", lc.getQualityGrade() == null ? null : lc.getQualityGrade().name(),
                "zoneId", lc.getZoneId());
    }

    private void audit(String action, Long id, Map<String, Object> before, Map<String, Object> after) {
        try {
            auditService.record(action, "leaf_collection", id, before, after);
        } catch (Exception ignored) {
            // The weigh-in is saved; a failed audit write must not undo it.
        }
    }

    // Tell every open console the day's leaf changed. One frame per change.
    private void pushChanged(LocalDate date) {
        try {
            notifications.send("Leaf collection updated",
                    "Weigh-ins changed for " + date, "leaf.saved", null);
        } catch (Exception ignored) {
            // A dropped frame must never fail a save that already committed.
        }
    }

    @Transactional(readOnly = true)
    public List<LeafResponse> listByDate(LocalDate date) {
        LocalDate d = (date != null) ? date : LocalDate.now();
        List<LeafCollection> rows = repo.findByCollectDateOrderByIdDesc(d);

        // One query for every photo on the sheet rather than one per row --
        // a 40-worker day would otherwise be 40 extra round trips.
        Map<Long, String> photoUrls = new HashMap<>();
        List<Long> photoIds = rows.stream()
                .map(LeafCollection::getPhotoId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (!photoIds.isEmpty()) {
            visionRepository.findByIdIn(photoIds)
                    .forEach(v -> photoUrls.put(v.getId(), v.getImageUrl()));
        }

        List<LeafResponse> out = new ArrayList<>();
        for (LeafCollection lc : rows) {
            // Use the batched map, not the single-row lookup, or the query we
            // just saved gets spent again once per row.
            out.add(toResponse(lc, null, photoUrls.get(lc.getPhotoId())));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public LeafSummaryResponse summary(LocalDate date) {
        LocalDate d = (date != null) ? date : LocalDate.now();
        List<LeafCollection> rows = repo.findByCollectDateOrderByIdDesc(d);
        BigDecimal total = BigDecimal.ZERO;
        for (LeafCollection lc : rows) {
            total = total.add(lc.getWeightKg() == null ? BigDecimal.ZERO : lc.getWeightKg());
        }
        return new LeafSummaryResponse(d, rows.size(), total);
    }

    // ---- helpers ----
    private LeafResponse toResponse(LeafCollection lc, Worker known) {
        return toResponse(lc, known, photoUrlFor(lc.getPhotoId()));
    }

    private LeafResponse toResponse(LeafCollection lc, Worker known, String photoUrl) {
        Worker w = (known != null) ? known : workerRepository.findById(lc.getWorkerId()).orElse(null);
        String workerName = (w != null) ? w.getFullName() : null;
        String zone = zoneName(lc.getZoneId());
        String grade = (lc.getQualityGrade() != null) ? lc.getQualityGrade().name() : null;
        return new LeafResponse(lc.getId(), lc.getWorkerId(), workerName, zone,
                lc.getZoneId(), lc.getCollectDate(), lc.getWeightKg(), grade,
                lc.getCreatedAt() == null ? null : lc.getCreatedAt().toString(),
                lc.getPhotoId(), photoUrl);
    }

    // Single-row lookup, for the record/amend paths where there is one photo.
    private String photoUrlFor(Long photoId) {
        if (photoId == null) {
            return null;
        }
        return visionRepository.findById(photoId)
                .map(com.chaghor.chaghor.vision.VisionInference::getImageUrl)
                .orElse(null);
    }

    // One worker's weigh-ins across a date range, oldest first.
    //
    // This is the EVIDENCE BEHIND A PAYSLIP. The admin table showed a payslip's
    // `totalLeafKg` as a single number and offered a Review button that only
    // changed the status -- so "review" meant approving an aggregate with
    // nothing to check it against. The repository method has always existed;
    // nothing exposed it.
    @Transactional(readOnly = true)
    public List<LeafResponse> workerRange(Long workerId, LocalDate from, LocalDate to) {
        LocalDate end = to != null ? to : LocalDate.now();
        LocalDate start = from != null ? from : end.withDayOfMonth(1);
        List<LeafCollection> rows =
                repo.findByWorkerIdAndCollectDateBetween(workerId, start, end);
        rows.sort(Comparator.comparing(
                LeafCollection::getCollectDate,
                Comparator.nullsLast(Comparator.naturalOrder())));

        // Batch the photo lookups, as listByDate does -- a month of weigh-ins
        // would otherwise be one extra query per row.
        Map<Long, String> photoUrls = new HashMap<>();
        List<Long> photoIds = rows.stream()
                .map(LeafCollection::getPhotoId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (!photoIds.isEmpty()) {
            visionRepository.findByIdIn(photoIds)
                    .forEach(v -> photoUrls.put(v.getId(), v.getImageUrl()));
        }

        Worker w = workerRepository.findById(workerId).orElse(null);
        List<LeafResponse> out = new ArrayList<>();
        for (LeafCollection lc : rows) {
            out.add(toResponse(lc, w, photoUrls.get(lc.getPhotoId())));
        }
        return out;
    }

    // Who plucked the most over the last `days`, biggest first.
    //
    // Replaces a hardcoded leaderboard of five invented names. Names come from
    // the worker rows, zones are resolved in memory (foreign keys here are
    // plain Longs, never JPA relations -- CLAUDE.md section 6).
    @Transactional(readOnly = true)
    public List<TopPlucker> topPluckers(int days, int limit) {
        int n = Math.max(1, Math.min(days, 90));
        int cap = Math.max(1, Math.min(limit, 50));
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(n - 1L);

        Map<Long, BigDecimal> kg = new HashMap<>();
        Map<Long, Set<LocalDate>> daysSeen = new HashMap<>();
        for (LeafCollection lc : repo.findByCollectDateBetween(start, end)) {
            if (lc.getWorkerId() == null) continue;
            kg.merge(lc.getWorkerId(), nz(lc.getWeightKg()), BigDecimal::add);
            daysSeen.computeIfAbsent(lc.getWorkerId(), k -> new HashSet<>())
                    .add(lc.getCollectDate());
        }
        if (kg.isEmpty()) {
            return List.of();
        }

        Map<Long, Worker> workers = new HashMap<>();
        for (Worker w : workerRepository.findAll()) {
            workers.put(w.getId(), w);
        }
        Map<Long, String> zones = new HashMap<>();
        for (var z : zoneRepository.findAll()) {
            zones.put(z.getId(), z.getName());
        }

        List<TopPlucker> out = new ArrayList<>();
        for (var e : kg.entrySet()) {
            Worker w = workers.get(e.getKey());
            // A weigh-in whose worker row is gone is skipped rather than shown
            // as a blank name on a leaderboard.
            if (w == null) continue;
            long d = daysSeen.getOrDefault(e.getKey(), Set.of()).size();
            BigDecimal total = e.getValue().setScale(2, RoundingMode.HALF_UP);
            BigDecimal avg = d == 0 ? BigDecimal.ZERO
                    : total.divide(BigDecimal.valueOf(d), 1, RoundingMode.HALF_UP);
            out.add(new TopPlucker(
                    w.getId(),
                    w.getNameBn() != null && !w.getNameBn().isBlank()
                            ? w.getNameBn() : w.getFullName(),
                    w.getZoneId() == null ? null : zones.get(w.getZoneId()),
                    total, d, avg));
        }
        out.sort(Comparator.comparing(TopPlucker::totalKg).reversed());
        return out.size() > cap ? out.subList(0, cap) : out;
    }

    // Per-day totals for the collection history chart, oldest first. Days with
    // no weigh-in come back as zero rather than being omitted, so the chart
    // keeps an even x-axis instead of silently closing the gap.
    @Transactional(readOnly = true)
    public List<LeafTrendPoint> trend(int days) {
        int n = Math.max(1, Math.min(days, 90));
        LocalDate end = LocalDate.now();
        LocalDate start = end.minusDays(n - 1L);

        Map<LocalDate, BigDecimal> kg = new HashMap<>();
        Map<LocalDate, Long> count = new HashMap<>();
        for (LeafCollection lc : repo.findByCollectDateBetween(start, end)) {
            kg.merge(lc.getCollectDate(), nz(lc.getWeightKg()), BigDecimal::add);
            count.merge(lc.getCollectDate(), 1L, Long::sum);
        }
        List<LeafTrendPoint> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            LocalDate d = start.plusDays(i);
            out.add(new LeafTrendPoint(
                    d,
                    d.getDayOfMonth() + "/" + d.getMonthValue(),
                    count.getOrDefault(d, 0L),
                    kg.getOrDefault(d, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP)));
        }
        return out;
    }

    private static BigDecimal nz(BigDecimal b) {
        return b == null ? BigDecimal.ZERO : b;
    }

    private String zoneName(Long zoneId) {
        if (zoneId == null) return null;
        return zoneRepository.findById(zoneId).map(Zone::getName).orElse(null);
    }

    private LeafGrade parseGrade(String g) {
        if (g == null || g.isBlank()) return null;
        try {
            return LeafGrade.valueOf(g.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid grade: " + g);
        }
    }

    // ---- how each field is doing --------------------------------------------

    // Kilos per worker present, today, versus that field's own recent norm and
    // versus the estate.
    //
    // PER WORKER, not total. A field with twelve pluckers will always out-total
    // a field with three, so raw kilos would just rank fields by headcount and
    // tell a supervisor nothing about how the picking is going.
    //
    // The norm window EXCLUDES today, so a field is never compared against a
    // number it is itself inside.
    @Transactional(readOnly = true)
    public List<ZonePerformance> zonePerformance(LocalDate date) {
        LocalDate d = date != null ? date : LocalDate.now();
        LocalDate from = d.minusDays(NORM_WINDOW_DAYS);

        // Workers present or late per zone, per day. Someone absent cannot pluck,
        // so they must not dilute the per-worker figure.
        Map<LocalDate, Map<Long, Long>> headcount = new HashMap<>();
        for (var a : attendanceRepository.findByWorkDateBetween(from, d)) {
            if (a.getZoneId() == null) continue;
            if (a.getStatus() != com.chaghor.chaghor.attendance.AttendanceStatus.present
                    && a.getStatus() != com.chaghor.chaghor.attendance.AttendanceStatus.late) continue;
            headcount.computeIfAbsent(a.getWorkDate(), k -> new HashMap<>())
                    .merge(a.getZoneId(), 1L, Long::sum);
        }

        Map<LocalDate, Map<Long, BigDecimal>> kilos = new HashMap<>();
        for (LeafCollection lc : repo.findByCollectDateBetween(from, d)) {
            if (lc.getZoneId() == null) continue;
            kilos.computeIfAbsent(lc.getCollectDate(), k -> new HashMap<>())
                    .merge(lc.getZoneId(), nz(lc.getWeightKg()), BigDecimal::add);
        }

        // Per-zone history of kg-per-worker, and the estate's, both excluding today.
        Map<Long, List<BigDecimal>> ownHistory = new HashMap<>();
        List<BigDecimal> estateHistory = new ArrayList<>();
        for (var dayEntry : kilos.entrySet()) {
            if (dayEntry.getKey().isEqual(d)) continue;
            Map<Long, Long> heads = headcount.getOrDefault(dayEntry.getKey(), Map.of());
            for (var z : dayEntry.getValue().entrySet()) {
                long n = heads.getOrDefault(z.getKey(), 0L);
                if (n <= 0) continue; // kilos with nobody marked present tell us nothing
                BigDecimal perWorker = z.getValue().divide(BigDecimal.valueOf(n), 2, RoundingMode.HALF_UP);
                ownHistory.computeIfAbsent(z.getKey(), k -> new ArrayList<>()).add(perWorker);
                estateHistory.add(perWorker);
            }
        }
        BigDecimal estateAvg = mean(estateHistory);

        Map<Long, Long> headsToday = headcount.getOrDefault(d, Map.of());
        Map<Long, BigDecimal> kgToday = kilos.getOrDefault(d, Map.of());

        List<ZonePerformance> out = new ArrayList<>();
        for (var z : zoneRepository.findByArchivedAtIsNullOrderByNameAsc()) {
            long heads = headsToday.getOrDefault(z.getId(), 0L);
            BigDecimal kg = kgToday.getOrDefault(z.getId(), null);
            BigDecimal own = mean(ownHistory.getOrDefault(z.getId(), List.of()));

            BigDecimal perWorker = (kg != null && heads > 0)
                    ? kg.divide(BigDecimal.valueOf(heads), 2, RoundingMode.HALF_UP)
                    : null;

            Double vsOwn = pctDiff(perWorker, own);
            Double vsEstate = pctDiff(perWorker, estateAvg);

            String band;
            String verdict;
            if (perWorker == null) {
                // Nothing weighed in yet is not a bad day -- it is no data. A
                // field nobody has reached must not be coloured as failing.
                band = "NO_DATA";
                verdict = heads == 0
                        ? "Nobody marked present in this field today."
                        : heads + " working here, no leaf weighed in yet.";
            } else if (vsOwn == null) {
                band = "NORMAL";
                verdict = perWorker + " kg per worker. Not enough history yet to say whether that is usual.";
            } else if (vsOwn >= GOOD_PCT) {
                band = "GOOD";
                verdict = perWorker + " kg per worker — " + Math.round(vsOwn)
                        + "% above this field's usual " + own + " kg.";
            } else if (vsOwn <= LOW_PCT) {
                band = "LOW";
                verdict = perWorker + " kg per worker — " + Math.abs(Math.round(vsOwn))
                        + "% below this field's usual " + own + " kg.";
            } else {
                band = "NORMAL";
                verdict = perWorker + " kg per worker, about usual for this field (" + own + " kg).";
            }
            if (perWorker != null && vsEstate != null) {
                verdict += vsEstate >= 0
                        ? " That is " + Math.round(vsEstate) + "% above the estate average."
                        : " That is " + Math.abs(Math.round(vsEstate)) + "% below the estate average.";
            }

            out.add(new ZonePerformance(z.getId(), z.getName(), z.getCode(),
                    (int) heads, kg, perWorker, own, estateAvg, vsOwn, vsEstate, band, verdict));
        }
        return out;
    }

    private static BigDecimal mean(List<BigDecimal> xs) {
        if (xs == null || xs.isEmpty()) return null;
        BigDecimal sum = BigDecimal.ZERO;
        for (BigDecimal x : xs) sum = sum.add(x);
        return sum.divide(BigDecimal.valueOf(xs.size()), 2, RoundingMode.HALF_UP);
    }

    // Null when there is nothing to compare against, rather than 0% -- "no
    // history" and "exactly average" are different answers.
    private static Double pctDiff(BigDecimal actual, BigDecimal baseline) {
        if (actual == null || baseline == null || baseline.signum() == 0) return null;
        return actual.subtract(baseline)
                .divide(baseline, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(1, RoundingMode.HALF_UP)
                .doubleValue();
    }


    // ---- yield forecast -----------------------------------------------------

    // What each field is likely to produce tomorrow.
    //
    // expected = recent kg-per-worker for that field x workers expected there,
    // adjusted for rain. Nothing is learned or fitted: with a few weeks of rows
    // an ML model would be fitting noise, and a short weighted average with its
    // assumptions written down is the honest version of this problem.
    //
    // Recent days are weighted more heavily than old ones, because a tea bush
    // in flush this week tells you more than one three weeks ago.
    @Transactional(readOnly = true)
    public YieldForecast forecast(LocalDate target) {
        LocalDate forDate = target != null ? target : LocalDate.now().plusDays(1);
        LocalDate histEnd = forDate.minusDays(1);
        LocalDate histStart = histEnd.minusDays(FORECAST_WINDOW_DAYS - 1L);

        // kg and heads per zone per day across the window
        Map<LocalDate, Map<Long, BigDecimal>> kilos = new HashMap<>();
        for (LeafCollection lc : repo.findByCollectDateBetween(histStart, histEnd)) {
            if (lc.getZoneId() == null) continue;
            kilos.computeIfAbsent(lc.getCollectDate(), k -> new HashMap<>())
                    .merge(lc.getZoneId(), nz(lc.getWeightKg()), BigDecimal::add);
        }
        Map<LocalDate, Map<Long, Long>> heads = new HashMap<>();
        for (var a : attendanceRepository.findByWorkDateBetween(histStart, histEnd)) {
            if (a.getZoneId() == null) continue;
            if (a.getStatus() != com.chaghor.chaghor.attendance.AttendanceStatus.present
                    && a.getStatus() != com.chaghor.chaghor.attendance.AttendanceStatus.late) continue;
            heads.computeIfAbsent(a.getWorkDate(), k -> new HashMap<>())
                    .merge(a.getZoneId(), 1L, Long::sum);
        }

        // Rain suppresses picking: wet leaf is heavier but pluckers move slower
        // and stop early. Only applied when a real reading exists.
        //
        // THE HEAVY-RAIN FACTOR IS NOW MEASURED, NOT GUESSED.
        // It used to be a flat 0.75 written straight into this method with
        // nothing behind it. RainImpactService compares kg per worker present
        // on wet days against dry days over the last six months of THIS
        // estate's own records, and that ratio is used instead whenever there
        // are enough matched days. Below the minimum it returns nothing and the
        // documented 0.75 stands — the note below always says which one applied,
        // so a reader is never left guessing whether a number was earned.
        //
        // Per worker, not per day: fewer people turn up when it rains, so
        // comparing daily totals would measure attendance as much as weather.
        BigDecimal weatherFactor = BigDecimal.ONE;
        String weatherNote = null;
        var latest = weatherLogRepository.findAllByOrderByIdDesc(PageRequest.of(0, 1));
        if (!latest.isEmpty()) {
            BigDecimal rain = latest.get(0).getRainfallMm();
            if (rain != null && rain.doubleValue() >= 10) {
                var impact = rainImpactService.measure();
                if (impact.enoughData() && impact.factor() != null) {
                    weatherFactor = impact.factor();
                    int cut = 100 - impact.factor()
                            .multiply(BigDecimal.valueOf(100)).intValue();
                    weatherNote = "Heavy rain in the last reading (" + rain + " mm). "
                            + (cut > 0
                               ? "Expectations cut by " + cut + "%, measured from "
                               : "No cut applied — wet days have not measurably hurt picking across ")
                            + impact.wetDays() + " wet and " + impact.dryDays()
                            + " dry days on this estate.";
                } else {
                    weatherFactor = new BigDecimal("0.75");
                    weatherNote = "Heavy rain in the last reading (" + rain + " mm) — "
                            + "expectations cut by 25%. That is an estimate, not a "
                            + "measurement: there are not yet enough matched wet and dry "
                            + "days on record to work out the real figure.";
                }
            } else if (rain != null && rain.doubleValue() >= 2.5) {
                weatherFactor = new BigDecimal("0.90");
                weatherNote = "Rain in the last reading (" + rain + " mm) — expectations cut by 10%.";
            } else {
                weatherNote = "No significant rain in the last reading.";
            }
        }

        List<YieldForecast.Field> out = new ArrayList<>();
        BigDecimal estate = BigDecimal.ZERO;
        int estateWorkers = 0;
        int bestHistory = 0;

        for (Zone z : zoneRepository.findByArchivedAtIsNullOrderByNameAsc()) {
            BigDecimal weightedSum = BigDecimal.ZERO;
            BigDecimal weightTotal = BigDecimal.ZERO;
            int days = 0;
            long lastHeads = 0;

            for (int back = 0; back < FORECAST_WINDOW_DAYS; back++) {
                LocalDate d = histEnd.minusDays(back);
                BigDecimal kg = kilos.getOrDefault(d, Map.of()).get(z.getId());
                long n = heads.getOrDefault(d, Map.of()).getOrDefault(z.getId(), 0L);
                if (kg == null || n <= 0) continue;
                // Linear decay: yesterday counts fully, the oldest day least.
                BigDecimal w = BigDecimal.valueOf(FORECAST_WINDOW_DAYS - back);
                weightedSum = weightedSum.add(kg.divide(BigDecimal.valueOf(n), 4, RoundingMode.HALF_UP).multiply(w));
                weightTotal = weightTotal.add(w);
                days++;
                if (lastHeads == 0) lastHeads = n;
            }

            if (days == 0) {
                out.add(new YieldForecast.Field(z.getId(), z.getName(), null, null, 0, 0,
                        z.getTargetKgPerDay(),
                        "No recent picking recorded here, so there is nothing to forecast from."));
                continue;
            }

            BigDecimal perWorker = weightedSum.divide(weightTotal, 2, RoundingMode.HALF_UP);
            BigDecimal expected = perWorker.multiply(BigDecimal.valueOf(lastHeads))
                    .multiply(weatherFactor).setScale(1, RoundingMode.HALF_UP);
            estate = estate.add(expected);
            estateWorkers += (int) lastHeads;
            bestHistory = Math.max(bestHistory, days);

            out.add(new YieldForecast.Field(z.getId(), z.getName(), expected, perWorker,
                    (int) lastHeads, days, z.getTargetKgPerDay(),
                    perWorker + " kg per worker over " + days
                            + (days == 1 ? " day" : " days") + ", " + lastHeads + " expected."));
        }

        String confidence = bestHistory >= 7 ? "GOOD" : bestHistory >= 3 ? "FAIR" : "WEAK";

        List<String> basis = new ArrayList<>();
        basis.add("Based on the " + FORECAST_WINDOW_DAYS + " days to " + histEnd
                + "; recent days count for more than older ones.");
        basis.add("Assumes the same number of workers turn up in each field as the last day it was picked.");
        if (weatherNote != null) basis.add(weatherNote);
        basis.add("This is a weighted average of what actually happened, not a learned model. "
                + "It cannot know about a festival, a strike or a field being rested.");
        if (!"GOOD".equals(confidence)) {
            basis.add("Only " + bestHistory + " day" + (bestHistory == 1 ? "" : "s")
                    + " of picking history — treat this as a rough guide.");
        }

        return new YieldForecast(forDate, estate.setScale(1, RoundingMode.HALF_UP),
                estateWorkers, confidence, weatherNote, out, basis);
    }
}
