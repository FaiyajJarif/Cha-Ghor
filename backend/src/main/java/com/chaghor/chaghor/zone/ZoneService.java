package com.chaghor.chaghor.zone;

import com.chaghor.chaghor.zone.dto.ZoneGeometryRequest;
import com.chaghor.chaghor.zone.dto.ZoneResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;

// Fields (zones), including where they sit on the map.
//
// Geometry is stored as a GeoJSON Feature in the existing polygon_geojson
// column: a Point for the centre plus a radiusM property. Reading unpacks it
// into plain lat/lng/radius so the frontend never parses GeoJSON, while the
// stored shape stays standard and leaves room for a traced polygon later.
@Service
public class ZoneService {

    private final ZoneRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();

    public ZoneService(ZoneRepository repo) {
        this.repo = repo;
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
