package com.chaghor.chaghor.fieldcase;

import com.chaghor.chaghor.fieldcase.dto.*;
import com.chaghor.chaghor.security.AppUserDetails;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// REST surface for the Reports & Complaints module. Reads are open to admin +
// supervisor. Submitting a case is open to any authenticated estate user
// (worker / supervisor / admin). Replying, changing status and deleting are
// admin-only. RBAC is enforced per method with @PreAuthorize.
@RestController
@RequestMapping("/api/v1/complaints")
public class FieldCaseController {

    private final FieldCaseService service;

    public FieldCaseController(FieldCaseService service) {
        this.service = service;
    }

    // The four KPI cards.
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public CaseSummaryResponse summary() {
        return service.summary();
    }

    // List cases, optionally filtered by tab: all | complaint | report.
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<CaseListItemResponse> list(@RequestParam(required = false) String type) {
        return service.list(type);
    }

    // Full case + reply thread (right-hand detail panel).
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public CaseDetailResponse detail(@PathVariable Long id) {
        return service.detail(id);
    }

    // Submit a complaint / report. Any authenticated user may raise one; the
    // submitter identity is taken from the JWT principal, not the request body.
    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public CaseDetailResponse create(@RequestBody CreateCaseRequest req,
                                     @AuthenticationPrincipal AppUserDetails principal) {
        return service.create(req, userId(principal), name(principal), role(principal));
    }

    // Admin replies to a case (first reply moves it to IN_PROGRESS).
    @PostMapping("/{id}/replies")
    @PreAuthorize("hasRole('ADMIN')")
    public CaseDetailResponse reply(@PathVariable Long id,
                                    @RequestBody ReplyRequest req,
                                    @AuthenticationPrincipal AppUserDetails principal) {
        return service.reply(id, req, userId(principal), name(principal), role(principal));
    }

    // Admin changes status (e.g. mark RESOLVED / REJECTED).
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public CaseDetailResponse updateStatus(@PathVariable Long id, @RequestBody UpdateStatusRequest req) {
        return service.updateStatus(id, req);
    }

    // Delete a case and its replies (admin only).
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    // ---- principal helpers ----
    private static Long userId(AppUserDetails p) {
        return p == null ? null : p.getUser().getId();
    }

    private static String name(AppUserDetails p) {
        if (p == null) return "";
        String dn = p.getUser().getDisplayName();
        return (dn == null || dn.isBlank()) ? p.getUser().getUsername() : dn;
    }

    private static String role(AppUserDetails p) {
        return p == null ? "" : p.getUser().getRole().name();
    }
}
