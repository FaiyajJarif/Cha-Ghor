package com.chaghor.chaghor.loan;

import com.chaghor.chaghor.loan.dto.*;
import com.chaghor.chaghor.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// REST surface for the Loans & Advances module. Reads are open to admin +
// supervisor; creating a request and approving / rejecting are admin-only. RBAC
// is enforced per method with @PreAuthorize (same style as Finance / Inventory,
// so no SecurityConfig change is needed).
@RestController
@RequestMapping("/api/v1/loans")
public class LoanController {

    private final LoanService service;

    public LoanController(LoanService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public LoanSummaryResponse summary() {
        return service.summary();
    }

    @GetMapping("/requests")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<LoanRequestResponse> requests(
            @RequestParam(defaultValue = "PENDING") String status) {
        return service.requests(status);
    }

    @GetMapping("/repayments")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public RepaymentPageResponse repayments(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "8") int size) {
        return service.repayments(page, size);
    }

    // Phase 1: @Valid enforces NewLoanRequest constraints.
    @PostMapping("/requests")
    @PreAuthorize("hasRole('ADMIN')")
    public LoanRequestResponse create(@Valid @RequestBody NewLoanRequest req) {
        return service.create(req);
    }

    // Record a repayment against an active loan. Admin-only, like approve/reject.
    @PostMapping("/{id}/repayments")
    @PreAuthorize("hasRole('ADMIN')")
    public RepaymentResponse recordRepayment(@PathVariable Long id,
                                             @Valid @RequestBody NewRepaymentRequest req,
                                             @AuthenticationPrincipal AppUserDetails principal) {
        Long userId = principal == null ? null : principal.getUser().getId();
        return service.recordRepayment(id, req, userId);
    }

    // action = approve | reject
    @PostMapping("/requests/{id}/{action}")
    @PreAuthorize("hasRole('ADMIN')")
    public LoanRequestResponse decide(@PathVariable Long id,
                                      @PathVariable String action,
                                      @AuthenticationPrincipal AppUserDetails principal) {
        Long userId = principal == null ? null : principal.getUser().getId();
        return service.decide(id, action, userId);
    }
}
