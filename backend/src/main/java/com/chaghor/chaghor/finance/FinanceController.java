package com.chaghor.chaghor.finance;

import com.chaghor.chaghor.finance.dto.*;
import com.chaghor.chaghor.security.AppUserDetails;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// REST surface for the Finance / Ledger module. Reads are open to admin +
// supervisor; creating ledger entries is admin-only. RBAC is enforced per
// method with @PreAuthorize, matching the Payroll module (no SecurityConfig
// change needed).
@RestController
@RequestMapping("/api/v1/finance")
public class FinanceController {

    private final FinanceService service;

    public FinanceController(FinanceService service) {
        this.service = service;
    }

    // Six KPI cards: revenue, expenses, net profit, cash on hand, payables, overdue.
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public FinanceSummaryResponse summary() {
        return service.summary();
    }

    // Monthly revenue / expense / profit series for the trend chart.
    @GetMapping("/trend")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<TrendPoint> trend(@RequestParam(defaultValue = "6") int months) {
        return service.trend(months);
    }

    // Expense breakdown by account for the donut.
    @GetMapping("/breakdown")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<BreakdownSlice> breakdown() {
        return service.breakdown();
    }

    // Paginated general ledger with optional filters.
    @GetMapping("/ledger")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public LedgerPageResponse ledger(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q) {
        return service.ledger(page, size, category, status, q);
    }

    // Money Movement: the auto-posted feed (payroll paid, withdrawals paid,
    // loan capital out / in). Same RBAC as the rest of the Finance reads.
    @GetMapping("/activity")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public ActivityPageResponse activity(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "8") int size,
            @RequestParam(required = false) String kind) {
        return service.activity(page, size, kind);
    }

    // Add a manual ledger entry (admin only). Phase 1: @Valid enforces EntryRequest constraints.
    @PostMapping("/entries")
    @PreAuthorize("hasRole('ADMIN')")
    public LedgerEntryResponse create(@Valid @RequestBody EntryRequest req,
                                      @AuthenticationPrincipal AppUserDetails principal) {
        Long userId = principal == null ? null : principal.getUser().getId();
        return service.create(req, userId);
    }
}
