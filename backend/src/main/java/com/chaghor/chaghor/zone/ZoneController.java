package com.chaghor.chaghor.zone;

import com.chaghor.chaghor.zone.dto.FieldResponse;
import com.chaghor.chaghor.zone.dto.FieldStateRequest;
import com.chaghor.chaghor.zone.dto.ZoneGeometryRequest;
import com.chaghor.chaghor.zone.dto.ZoneResponse;
import com.chaghor.chaghor.zone.dto.ZoneUpsertRequest;
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

    // The Fields board: every field with its state plus the day's workers,
    // yield and efficiency, computed from the registers.
    @GetMapping("/fields")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<FieldResponse> fields(
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate date) {
        return service.fields(date);
    }

    // Status, ground condition, note and site photo -- what the supervisor
    // observed. Supervisor-writable: they are the one standing in the field.
    @PutMapping("/{id}/state")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public FieldResponse updateState(@PathVariable Long id,
                                     @Valid @RequestBody FieldStateRequest req) {
        return service.updateState(id, req);
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

    // ---- field management ---------------------------------------------------
    //
    // Admin only. Adding or retiring a field changes what every supervisor sees
    // on their map and in every zone picker, so it is not a field-side action.

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ZoneResponse create(@Valid @RequestBody ZoneUpsertRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ZoneResponse update(@PathVariable Long id, @Valid @RequestBody ZoneUpsertRequest req) {
        return service.update(id, req);
    }

    // Retires the field. Deliberately NOT a destructive delete -- see
    // ZoneService.archive for why the history would not survive one.
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ZoneResponse archive(@PathVariable Long id) {
        return service.archive(id);
    }

    @PostMapping("/{id}/restore")
    @PreAuthorize("hasRole('ADMIN')")
    public ZoneResponse restore(@PathVariable Long id) {
        return service.restore(id);
    }

    @GetMapping("/archived")
    @PreAuthorize("hasRole('ADMIN')")
    public List<ZoneResponse> archived() {
        return service.archived();
    }
}
