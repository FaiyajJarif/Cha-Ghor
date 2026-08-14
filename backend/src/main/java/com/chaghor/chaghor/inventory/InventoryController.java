package com.chaghor.chaghor.inventory;

import jakarta.validation.Valid;
import com.chaghor.chaghor.inventory.dto.*;
import com.chaghor.chaghor.security.AppUserDetails;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// REST surface for the Inventory / Requisition module. Reads are open to admin +
// supervisor; adding items and deciding requisitions are admin-only. RBAC is
// enforced per method with @PreAuthorize (same style as Finance / Payroll, so no
// SecurityConfig change is needed).
@RestController
@RequestMapping("/api/v1/inventory")
public class InventoryController {

    private final InventoryService service;

    public InventoryController(InventoryService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public InventorySummaryResponse summary() {
        return service.summary();
    }

    @GetMapping("/items")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public ItemPageResponse items(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "8") int size,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String q) {
        return service.items(page, size, category, q);
    }

    @PostMapping("/items")
    @PreAuthorize("hasRole('ADMIN')")
    public ItemResponse create(@Valid @RequestBody NewItemRequest req) {
        return service.createItem(req);
    }

    @GetMapping("/distribution")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public DistributionResponse distribution() {
        return service.distribution();
    }

    @GetMapping("/requisitions")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<RequisitionResponse> requisitions(
            @RequestParam(defaultValue = "PENDING") String status) {
        return service.requisitions(status);
    }

    // action = approve | hold | reject
    @PostMapping("/requisitions/{id}/{action}")
    @PreAuthorize("hasRole('ADMIN')")
    public RequisitionResponse decide(@PathVariable Long id,
                                      @PathVariable String action,
                                      @AuthenticationPrincipal AppUserDetails principal) {
        Long userId = principal == null ? null : principal.getUser().getId();
        return service.decide(id, action, userId);
    }
}
