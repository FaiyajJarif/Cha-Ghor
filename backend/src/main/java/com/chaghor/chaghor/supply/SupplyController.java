package com.chaghor.chaghor.supply;

import jakarta.validation.Valid;
import com.chaghor.chaghor.supply.dto.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// REST surface for the Supply Chain module. Reads are open to admin +
// supervisor; dispatching a shipment is admin-only. RBAC is enforced per method
// with @PreAuthorize. The public /track/** endpoints are intentionally
// unauthenticated (whitelisted in SecurityConfig) — drivers are not user
// accounts, so the unguessable per-shipment token is the authorization.
@RestController
@RequestMapping("/api/v1/supply")
public class SupplyController {

    private final SupplyService service;
    private final SupplyEvents events;

    public SupplyController(SupplyService service, SupplyEvents events) {
        this.service = service;
        this.events = events;
    }

    // The six KPI cards.
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public SupplySummaryResponse summary() {
        return service.summary();
    }

    // Shipments for the Active Routes list + Live Shipment Tracker.
    @GetMapping("/shipments")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<ShipmentResponse> shipments() {
        return service.shipments();
    }

    // Warehouse Stock Distribution bars (grouped by stage).
    @GetMapping("/stock")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<StockBucketResponse> stock() {
        return service.stock();
    }

    // Dispatch Readiness quality-gate cards.
    @GetMapping("/batches")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<BatchResponse> batches() {
        return service.batches();
    }

    // Paginated Sales Transaction Ledger.
    @GetMapping("/sales")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public PagedSalesResponse sales(@RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "10") int size) {
        return service.sales(page, size);
    }

    // Dispatch a new shipment (admin only).
    @PostMapping("/shipments")
    @PreAuthorize("hasRole('ADMIN')")
    public ShipmentResponse dispatch(@Valid @RequestBody DispatchShipmentRequest req) {
        ShipmentResponse res = service.dispatch(req);
        events.boardChanged();
        return res;
    }

    // Manually set / correct a shipment's status (admin only). Admins get full
    // control, including moving a shipment back a step to fix a mistake.
    @PatchMapping("/shipments/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ShipmentResponse updateStatus(@PathVariable Long id, @Valid @RequestBody UpdateStatusRequest req) {
        ShipmentResponse res = service.updateStatus(id, req);
        events.boardChanged();
        return res;
    }

    // Edit an existing shipment's route / haulage details after dispatch (admin only).
    @PutMapping("/shipments/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ShipmentResponse updateShipment(@PathVariable Long id, @Valid @RequestBody UpdateShipmentRequest req) {
        ShipmentResponse res = service.updateShipment(id, req);
        events.boardChanged();
        return res;
    }

    // Permanently delete a shipment, e.g. clearing old delivered rows so the
    // table + database stay lean (admin only).
    @DeleteMapping("/shipments/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteShipment(@PathVariable Long id) {
        service.deleteShipment(id);
        events.boardChanged();
    }

    // Warehouse marker for the admin live map.
    @GetMapping("/warehouse")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public WarehouseResponse warehouse() {
        return service.warehouse();
    }

    // Relocate the estate warehouse shown on the live map (admin only).
    @PutMapping("/warehouse")
    @PreAuthorize("hasRole('ADMIN')")
    public WarehouseResponse updateWarehouse(@Valid @RequestBody WarehouseUpdateRequest req) {
        WarehouseResponse res = service.updateWarehouse(req);
        events.boardChanged();
        return res;
    }

    // ----- Public driver tracking (no auth; guarded by the per-shipment token) -----

    @GetMapping("/track/{token}")
    public TrackResponse track(@PathVariable String token) {
        return service.track(token);
    }

    @PostMapping("/track/{token}/location")
    public TrackResponse recordLocation(
            @PathVariable String token, @Valid @RequestBody LocationPingRequest req) {
        TrackResponse res = service.recordLocation(token, req);
        events.locationChanged();
        return res;
    }
}
