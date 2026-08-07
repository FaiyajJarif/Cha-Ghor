package com.chaghor.chaghor.zone;

import com.chaghor.chaghor.zone.dto.FieldResponse;
import com.chaghor.chaghor.zone.dto.FieldStateRequest;
import com.chaghor.chaghor.zone.dto.ZoneGeometryRequest;
import com.chaghor.chaghor.zone.dto.ZoneResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
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
        for (Zone z : repo.findAll()) {
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
    public List<ZoneResponse> list() {
        List<ZoneResponse> out = new ArrayList<>();
        for (Zone z : repo.findAll()) {
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
}
