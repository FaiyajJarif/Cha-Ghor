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

    private final ZoneRepository repo;
    private final com.chaghor.chaghor.attendance.AttendanceRepository attendanceRepository;
    private final com.chaghor.chaghor.leaf.LeafCollectionRepository leafRepository;
    private final ObjectMapper mapper = new ObjectMapper();

    public ZoneService(ZoneRepository repo,
                       com.chaghor.chaghor.attendance.AttendanceRepository attendanceRepository,
                       com.chaghor.chaghor.leaf.LeafCollectionRepository leafRepository) {
        this.repo = repo;
        this.attendanceRepository = attendanceRepository;
        this.leafRepository = leafRepository;
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
            out.add(new FieldResponse(
                    z.getId(), z.getName(), z.getCode(),
                    z.getStatus(), z.getCondition(), z.getFieldNote(), z.getPhotoUrl(),
                    z.getAreaHectare(), target,
                    g.placed(), g.lat(), g.lng(), g.radiusM(),
                    workers.getOrDefault(z.getId(), 0L),
                    kg,
                    weighIns.getOrDefault(z.getId(), 0L),
                    eff));
        }
        return out;
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
        return toResponse(z);
    }

    // Remove a field's position without deleting the field itself.
    @Transactional
    public ZoneResponse clearGeometry(Long id) {
        Zone z = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That field could not be found."));
        z.setPolygonGeojson(null);
        repo.save(z);
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
        apply(z, req, null);
        return toResponse(repo.save(z));
    }

    @Transactional
    public ZoneResponse update(Long id, ZoneUpsertRequest req) {
        Zone z = live(id);
        apply(z, req, id);
        return toResponse(repo.save(z));
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
        return toResponse(repo.save(z));
    }

    @Transactional
    public ZoneResponse restore(Long id) {
        Zone z = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "That field could not be found."));
        if (z.getArchivedAt() == null) {
            return toResponse(z); // already live, nothing to do
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
        return toResponse(repo.save(z));
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
