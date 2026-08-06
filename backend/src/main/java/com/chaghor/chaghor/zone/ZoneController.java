package com.chaghor.chaghor.zone;

import com.chaghor.chaghor.zone.dto.ZoneGeometryRequest;
import com.chaghor.chaghor.zone.dto.ZoneResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Fields (zones) and where they sit on the map.
//
// Placing a field is a SUPERVISOR action as well as an admin one: the person
// who walks the estate is the one who knows where the boundary actually is.
@RestController
@RequestMapping("/api/v1/zones")
public class ZoneController {

    private final ZoneService service;

    public ZoneController(ZoneService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<ZoneResponse> list() {
        return service.list();
    }

    // Drop or move a field's pin. Idempotent — saving the same position twice
    // is a no-op, and moving it just overwrites the previous one.
    @PutMapping("/{id}/geometry")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public ZoneResponse saveGeometry(@PathVariable Long id,
                                     @Valid @RequestBody ZoneGeometryRequest req) {
        return service.saveGeometry(id, req);
    }

    // Un-place a field without deleting it.
    @DeleteMapping("/{id}/geometry")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public ZoneResponse clearGeometry(@PathVariable Long id) {
        return service.clearGeometry(id);
    }
}
