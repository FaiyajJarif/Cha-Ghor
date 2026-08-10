package com.chaghor.chaghor.zone;

import com.chaghor.chaghor.zone.dto.FieldResponse;
import com.chaghor.chaghor.zone.dto.FieldStateRequest;
import com.chaghor.chaghor.zone.dto.ZoneGeometryRequest;
import com.chaghor.chaghor.zone.dto.ZoneResponse;
import com.chaghor.chaghor.zone.dto.ZoneUpsertRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Fields (zones), including where they sit on the map.
//
// Geometry is stored as a GeoJSON Feature in the existing polygon_geojson
// column: a Point for the centre plus a radiusM property. Reading unpacks it
// into plain lat/lng/radius so the frontend never parses GeoJSON, while the
// stored shape stays standard and leaves room for a traced polygon later.
@Service
public class ZoneService {

    // How far back "usual for this field" looks when suggesting a condition.
    // Same window as LeafCollectionService.zonePerformance() on purpose: two
    // different definitions of a field's norm on the same screen would be worse
    // than one imperfect definition.
    private static final int NORM_WINDOW_DAYS = 14;
    // Below these fractions of its own norm, a field is doing badly enough to
    // be worth a second look. Wide on purpose -- daily picking varies a lot,
    // and a hint that fires constantly gets ignored.
    private static final double POOR_RATIO = 0.60;
    private static final double CAUTION_RATIO = 0.80;
    // Matched to LeafCollectionService.forecast() and PluckAdvisorService.
    private static final double HEAVY_RAIN_MM = 10.0;

    private final ZoneRepository repo;
    private final com.chaghor.chaghor.attendance.AttendanceRepository attendanceRepository;
    private final com.chaghor.chaghor.leaf.LeafCollectionRepository leafRepository;
    private final com.chaghor.chaghor.weather.WeatherLogRepository weatherLogRepository;
    private final com.chaghor.chaghor.notification.NotificationService notifications;
    private final ObjectMapper mapper = new ObjectMapper();

    public ZoneService(ZoneRepository repo,
                       com.chaghor.chaghor.attendance.AttendanceRepository attendanceRepository,
                       com.chaghor.chaghor.leaf.LeafCollectionRepository leafRepository,
                       com.chaghor.chaghor.weather.WeatherLogRepository weatherLogRepository,
                       com.chaghor.chaghor.notification.NotificationService notifications) {
        this.repo = repo;
        this.attendanceRepository = attendanceRepository;
        this.leafRepository = leafRepository;
        this.weatherLogRepository = weatherLogRepository;
        this.notifications = notifications;
    }

    // Tell every open console that a field changed.
    //
    // WHY THIS EXISTS
    //   Attendance, leaf and harvest all pushed a frame when they changed;
    //   zones did not. The result was an inconsistency nobody would guess from
    //   the UI: weigh a bucket of leaf and every open Fields board updated
    //   within a second, but RENAME a field, move its pin, retire it or set its
    //   condition and other people's boards kept showing the old value until
    //   they happened to reload. Two supervisors could be looking at different
    //   maps of the same estate.
    //
    //   The frame carries no data, only a nudge -- the listener refetches. That
    //   is the same contract as leaf.saved and attendance.saved, and it means
    //   this method never has to know which of the many things on a Fields
    //   board a given change affected.
    private void pushZoneChanged(String what) {
        try {
            notifications.send("Fields updated", what, "zone.saved", null);
        } catch (Exception ignored) {
            // The change is committed. A dropped frame must never undo a write
            // that already succeeded -- the worst case is a board that refreshes
            // a little later than it could have.
        }
    }

    // ---- the Fields board --------------------------------------------------

    // Every field with its state and its numbers for one day.
    //
    // Workers and yield are computed from the registers rather than stored, so
    // they cannot drift out of step with attendance and leaf_collection. A
    // field is credited with the workers assigned to it that day, which is not
    // the same as the workers whose home zone it is.
    @Transactional(readOnly = true)
    public List<FieldResponse> fields(java.time.LocalDate date) {
        java.time.LocalDate d = date != null ? date : java.time.LocalDate.now();

        Map<Long, Long> workers = new HashMap<>();
        for (var a : attendanceRepository.findByWorkDate(d)) {
            if (a.getZoneId() == null) continue;
            if (a.getStatus() == com.chaghor.chaghor.attendance.AttendanceStatus.present
                    || a.getStatus() == com.chaghor.chaghor.attendance.AttendanceStatus.late) {
                workers.merge(a.getZoneId(), 1L, Long::sum);
            }
        }

        Map<Long, BigDecimal> yield = new HashMap<>();
        Map<Long, Long> weighIns = new HashMap<>();
        for (var lc : leafRepository.findByCollectDateBetween(d, d)) {
            if (lc.getZoneId() == null) continue;
            yield.merge(lc.getZoneId(),
                    lc.getWeightKg() == null ? BigDecimal.ZERO : lc.getWeightKg(),
                    BigDecimal::add);
            weighIns.merge(lc.getZoneId(), 1L, Long::sum);
        }

        // "Usual for this field" over the fortnight before the day being shown,
        // per field, per DAY IT WAS ACTUALLY PICKED. Dividing by the whole
        // window would drag the norm down for any field on a long round and
        // make it look permanently poor.
        Map<Long, BigDecimal> normTotal = new HashMap<>();
        Map<Long, java.util.Set<java.time.LocalDate>> normDays = new HashMap<>();
        for (var lc : leafRepository.findByCollectDateBetween(d.minusDays(NORM_WINDOW_DAYS), d.minusDays(1))) {
            if (lc.getZoneId() == null) continue;
            normTotal.merge(lc.getZoneId(),
                    lc.getWeightKg() == null ? BigDecimal.ZERO : lc.getWeightKg(),
                    BigDecimal::add);
            normDays.computeIfAbsent(lc.getZoneId(), k -> new java.util.HashSet<>())
                    .add(lc.getCollectDate());
        }
        BigDecimal recentRain = latestRainfallMm();

        List<FieldResponse> out = new ArrayList<>();
        for (Zone z : repo.findByArchivedAtIsNullOrderByNameAsc()) {
            ZoneResponse g = toResponse(z);
            BigDecimal kg = yield.getOrDefault(z.getId(), BigDecimal.ZERO)
                    .setScale(2, java.math.RoundingMode.HALF_UP);
            BigDecimal target = z.getTargetKgPerDay();
            Integer eff = (target != null && target.signum() > 0)
                    ? kg.multiply(BigDecimal.valueOf(100))
                        .divide(target, 0, java.math.RoundingMode.HALF_UP).intValue()
                    : null;

            int nDays = normDays.getOrDefault(z.getId(), java.util.Set.of()).size();
            BigDecimal norm = (nDays == 0) ? null
                    : normTotal.getOrDefault(z.getId(), BigDecimal.ZERO)
                        .divide(BigDecimal.valueOf(nDays), 2, java.math.RoundingMode.HALF_UP);
            String[] hint = suggestCondition(z, kg, norm,
                    weighIns.getOrDefault(z.getId(), 0L), recentRain);

            out.add(new FieldResponse(
                    z.getId(), z.getName(), z.getCode(),
                    z.getStatus(), z.getCondition(), z.getFieldNote(), z.getPhotoUrl(),
                    z.getAreaHectare(), target,
                    g.placed(), g.lat(), g.lng(), g.radiusM(),
                    workers.getOrDefault(z.getId(), 0L),
                    kg,
                    weighIns.getOrDefault(z.getId(), 0L),
                    eff,
                    hint[0], hint[1]));
        }
        return out;
    }

    // A SUGGESTED ground condition, and the reason for it. Never written.
    //
    // WHY THIS IS ONLY A SUGGESTION
    //   V23 argued that condition cannot be derived, and that is still right:
    //   "muddy after last night's rain" or "pest damage on the north edge" is
    //   something a person sees standing in the field, and no column in this
    //   database contains it. What CAN be seen from here is a field bringing in
    //   far less than it usually does, which is often the first symptom of
    //   exactly those things -- so it is worth surfacing as a question, not an
    //   answer. The supervisor accepts it or ignores it; nothing here calls
    //   setCondition().
    //
    // Returns {suggestedCondition, reason}, or {null, null} when there is
    // nothing worth saying.
    private String[] suggestCondition(Zone z, BigDecimal todayKg, BigDecimal norm,
                                      long weighIns, BigDecimal rainMm) {
        // A closed field has no picking to judge, and its condition is not
        // what is keeping it closed.
        if (!"active".equals(z.getStatus())) return new String[]{null, null};
        // No history to compare against. Silence beats a guess dressed as data.
        if (norm == null || norm.signum() <= 0) return new String[]{null, null};
        // Nothing was weighed in. That usually means nobody picked here today,
        // not that the field has gone bad -- calling it poor would be wrong.
        if (weighIns == 0) return new String[]{null, null};

        double ratio = todayKg.doubleValue() / norm.doubleValue();
        int pct = (int) Math.round(ratio * 100);

        String suggestion;
        String reason;
        if (ratio < POOR_RATIO) {
            suggestion = "poor";
            reason = "Brought in " + pct + "% of what this field usually does ("
                    + todayKg.stripTrailingZeros().toPlainString() + " kg against a "
                    + norm.stripTrailingZeros().toPlainString() + " kg average). Worth walking.";
        } else if (ratio < CAUTION_RATIO) {
            suggestion = "caution";
            reason = "Down to " + pct + "% of this field's own average.";
        } else {
            suggestion = "good";
            reason = "Picking at " + pct + "% of its own average.";
        }

        // Heavy rain explains a low day without the field being in trouble, so
        // it softens the call rather than confirming it.
        if (rainMm != null && rainMm.doubleValue() >= HEAVY_RAIN_MM && "poor".equals(suggestion)) {
            suggestion = "caution";
            reason = "Down to " + pct + "% of its own average, but there was "
                    + rainMm.stripTrailingZeros().toPlainString()
                    + " mm of rain — that alone can explain a short day.";
        }

        // Only speak up when it disagrees with what is already recorded.
        if (suggestion.equals(z.getCondition())) return new String[]{null, null};
        return new String[]{suggestion, reason};
    }

    private BigDecimal latestRainfallMm() {
        var latest = weatherLogRepository.findAllByOrderByIdDesc(
                org.springframework.data.domain.PageRequest.of(0, 1));
        return latest.isEmpty() ? null : latest.get(0).getRainfallMm();
    }

    // Status, condition, note and photo -- what a supervisor observes on the
    // ground. Nulls are ignored so the form can send only what changed.
    @Transactional
    public FieldResponse updateState(Long id, FieldStateRequest req) {
        Zone z = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That field could not be found."));
        if (req.status() != null && !req.status().isBlank()) {
            z.setStatus(req.status().trim().toLowerCase());
        }
        if (req.condition() != null && !req.condition().isBlank()) {
            z.setCondition(req.condition().trim().toLowerCase());
        }
        if (req.fieldNote() != null) {
            z.setFieldNote(req.fieldNote().isBlank() ? null : req.fieldNote().trim());
        }
        if (req.photoUrl() != null) {
            z.setPhotoUrl(req.photoUrl().isBlank() ? null : req.photoUrl().trim());
        }
        z.setUpdatedAt(java.time.OffsetDateTime.now());
        repo.save(z);
        pushZoneChanged(z.getName() + " is now " + z.getStatus() + " / " + z.getCondition());
        return fields(null).stream()
                .filter(f -> f.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That field could not be found."));
    }

    @Transactional(readOnly = true)
    // Live fields only. An archived field must not reappear in a picker or on
    // a map — that is the whole point of archiving it.
    public List<ZoneResponse> list() {
        List<ZoneResponse> out = new ArrayList<>();
        for (Zone z : repo.findByArchivedAtIsNullOrderByNameAsc()) {
            out.add(toResponse(z));
        }
        return out;
    }

    @Transactional
    public ZoneResponse saveGeometry(Long id, ZoneGeometryRequest req) {
        Zone z = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That field could not be found."));
        try {
            var feature = mapper.createObjectNode();
            feature.put("type", "Feature");
            var geometry = mapper.createObjectNode();
            geometry.put("type", "Point");
            // GeoJSON is [longitude, latitude] -- the reverse of how everyone
            // says it out loud, and the single most common way to corrupt map
            // data. Written explicitly here so it cannot be flipped by accident.
            var coords = mapper.createArrayNode();
            coords.add(req.lng());
            coords.add(req.lat());
            geometry.set("coordinates", coords);
            feature.set("geometry", geometry);
            var props = mapper.createObjectNode();
            props.put("radiusM", req.radiusM());
            feature.set("properties", props);
            z.setPolygonGeojson(mapper.writeValueAsString(feature));
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "That field's position could not be saved.");
        }
        repo.save(z);
        pushZoneChanged(z.getName() + " was placed on the map");
        return toResponse(z);
    }

    // Remove a field's position without deleting the field itself.
    @Transactional
    public ZoneResponse clearGeometry(Long id) {
        Zone z = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That field could not be found."));
        z.setPolygonGeojson(null);
        repo.save(z);
        pushZoneChanged(z.getName() + " was taken off the map");
        return toResponse(z);
    }

    private ZoneResponse toResponse(Zone z) {
        Double lat = null, lng = null;
        Integer radius = null;
        String json = z.getPolygonGeojson();
        if (json != null && !json.isBlank()) {
            try {
                JsonNode f = mapper.readTree(json);
                JsonNode c = f.path("geometry").path("coordinates");
                if (c.isArray() && c.size() >= 2) {
                    lng = c.get(0).asDouble();
                    lat = c.get(1).asDouble();
                }
                JsonNode r = f.path("properties").path("radiusM");
                if (!r.isMissingNode() && !r.isNull()) {
                    radius = r.asInt();
                }
            } catch (Exception ignored) {
                // A blob we cannot parse is treated as "not placed" rather than
                // failing the whole list -- one bad row must not blank the map.
            }
        }
        boolean placed = lat != null && lng != null;
        return new ZoneResponse(
                z.getId(), z.getName(), z.getCode(),
                z.getAreaHectare(), z.getTargetKgPerDay(),
                placed, lat, lng, placed ? (radius == null ? 250 : radius) : null);
    }

    // ---- create / rename / retire ------------------------------------------

    @Transactional
    public ZoneResponse create(ZoneUpsertRequest req) {
        Zone z = new Zone();
        guardTarget(null, req);
        apply(z, req, null);
        Zone saved = repo.save(z);
        pushZoneChanged(saved.getName() + " was added");
        return toResponse(saved);
    }

    @Transactional
    public ZoneResponse update(Long id, ZoneUpsertRequest req) {
        Zone z = live(id);
        guardTarget(z, req);
        apply(z, req, id);
        Zone saved = repo.save(z);
        pushZoneChanged(saved.getName() + " was updated");
        return toResponse(saved);
    }

    // THE DAILY TARGET IS ADMIN-ONLY, and it is the one thing on this form that
    // is.
    //
    // Supervisors can now add, rename and retire fields -- they walk the estate
    // and know when a block is opened or closed, and routing that through the
    // office was making the map wrong rather than making it safe. But
    // target_kg_per_day is the number a supervisor's own field is judged
    // against on the leaderboard and in the efficiency column. Letting someone
    // edit the bar they are measured by is a different kind of permission, so
    // it stays with the office.
    //
    // Enforced HERE rather than at the controller because it is a field-level
    // rule inside an otherwise-allowed request. The UI hides the input for
    // supervisors, so reaching this error means something bypassed the form,
    // and it says so plainly instead of silently discarding the value.
    private void guardTarget(Zone existing, ZoneUpsertRequest req) {
        if (isAdmin()) return;

        BigDecimal wanted = req.targetKgPerDay();
        BigDecimal current = (existing == null) ? null : existing.getTargetKgPerDay();

        boolean changed = (wanted == null)
                ? current != null
                : (current == null || wanted.compareTo(current) != 0);

        if (changed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the office can set a field's daily target. Everything else "
                            + "about the field can be changed here.");
        }
    }

    private boolean isAdmin() {
        var auth = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication();
        if (auth == null) return false;
        return auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }

    // Retire a field. This is NOT a delete, and the difference matters:
    // attendance.zone_id and leaf_collection.zone_id are ON DELETE SET NULL, so
    // really deleting the row would strip the field attribution off every
    // historical attendance mark and leaf weigh-in -- last season's yield per
    // field would stop adding up, permanently and silently. Archiving hides the
    // field from every picker and map while leaving all of that intact.
    @Transactional
    public ZoneResponse archive(Long id) {
        Zone z = live(id);
        z.setArchivedAt(OffsetDateTime.now());
        Zone saved = repo.save(z);
        // Retiring a field removes it from every picker and map, so this is the
        // change other consoles most need to hear about.
        pushZoneChanged(saved.getName() + " was retired");
        return toResponse(saved);
    }

    @Transactional
    public ZoneResponse restore(Long id) {
        Zone z = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "That field could not be found."));
        if (z.getArchivedAt() == null) {
            // Already live. NOTHING CHANGED, so no frame -- a replayed restore
            // from the offline outbox must not make every open board refetch.
            return toResponse(z);
        }
        // Its old code may have been reused while it was retired.
        if (z.getCode() != null && !z.getCode().isBlank()) {
            repo.findFirstByCodeIgnoreCaseAndArchivedAtIsNull(z.getCode().trim())
                    .filter(other -> !other.getId().equals(z.getId()))
                    .ifPresent(other -> {
                        throw new ResponseStatusException(HttpStatus.CONFLICT,
                                "Another field is already using the code " + z.getCode()
                                        + ". Rename that one first, or give this field a new code.");
                    });
        }
        z.setArchivedAt(null);
        Zone saved = repo.save(z);
        pushZoneChanged(saved.getName() + " is back in use");
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ZoneResponse> archived() {
        List<ZoneResponse> out = new ArrayList<>();
        for (Zone z : repo.findAll()) {
            if (z.getArchivedAt() != null) {
                out.add(toResponse(z));
            }
        }
        return out;
    }

    private Zone live(Long id) {
        Zone z = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "That field could not be found."));
        if (z.getArchivedAt() != null) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "That field has been retired. Restore it before making changes.");
        }
        return z;
    }

    private void apply(Zone z, ZoneUpsertRequest req, Long selfId) {
        String name = req.name() == null ? "" : req.name().trim();
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give the field a name.");
        }
        String code = req.code() == null ? null : req.code().trim();
        if (code != null && code.isEmpty()) {
            code = null;
        }
        // Checked here so the user gets a sentence instead of a raw constraint
        // violation from ux_zones_code_active.
        if (code != null) {
            final String c = code;
            repo.findFirstByCodeIgnoreCaseAndArchivedAtIsNull(c)
                    .filter(other -> selfId == null || !other.getId().equals(selfId))
                    .ifPresent(other -> {
                        throw new ResponseStatusException(HttpStatus.CONFLICT,
                                "The code " + c + " is already used by " + other.getName() + ".");
                    });
        }
        z.setName(name);
        z.setCode(code);
        z.setAreaHectare(req.areaHectare());
        z.setTargetKgPerDay(req.targetKgPerDay());
    }
}
