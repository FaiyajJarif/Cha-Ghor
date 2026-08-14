package com.chaghor.chaghor.payroll;

import jakarta.validation.Valid;
import com.chaghor.chaghor.payroll.dto.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

// REST surface for the Payroll & Wage module. Method-level @PreAuthorize does
// the RBAC, so no change to SecurityConfig is needed. Dates arrive as ISO
// yyyy-MM-dd query params; a missing period defaults to the current month.
@RestController
@RequestMapping("/api/v1/payroll")
public class PayrollController {

    private final PayrollService service;

    public PayrollController(PayrollService service) {
        this.service = service;
    }

    // The cycle view: all payslips for a period (optionally filtered by status).
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<PayrollResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodEnd,
            @RequestParam(required = false) String status) {
        return service.list(periodStart, periodEnd, status);
    }

    // Counts by status + total gross/net for a period (KPI cards).
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public PayrollSummaryResponse summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodEnd) {
        return service.summary(periodStart, periodEnd);
    }

    // Net pay per period for the last `limit` periods (the trend chart).
    @GetMapping("/trend")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<TrendPoint> trend(@RequestParam(defaultValue = "14") int limit) {
        return service.trend(limit);
    }

    // v10: advances already paid out that no payslip has absorbed yet. Drives
    // the "pending recovery" banner so this money is never quietly forgotten.
    @GetMapping("/pending-recoveries")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public PendingRecoveryResponse pendingRecoveries() {
        return service.pendingRecoveries();
    }

    // "Apply to Pay Run" / Generate cycle: build or refresh Draft payslips for
    // the period from attendance. Idempotent; never overwrites non-Draft rows.
    @PostMapping("/generate")
    @PreAuthorize("hasRole('ADMIN')")
    public com.chaghor.chaghor.payroll.dto.GenerateResult generate(
            @Valid @RequestBody(required = false) GenerateRequest req) {
        LocalDate start = req != null ? req.periodStart() : null;
        LocalDate end = req != null ? req.periodEnd() : null;
        return service.generate(start, end);
    }

    @PutMapping("/{id}/deductions")
    @PreAuthorize("hasRole('ADMIN')")
    public PayrollResponse deductions(@PathVariable Long id, @Valid @RequestBody DeductionRequest req) {
        return service.updateDeductions(id, req);
    }

    @PostMapping("/{id}/review")
    @PreAuthorize("hasRole('ADMIN')")
    public PayrollResponse review(@PathVariable Long id) {
        return service.submitForReview(id);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    public PayrollResponse approve(@PathVariable Long id, Authentication auth) {
        return service.approve(id, auth != null ? auth.getName() : null);
    }

    @PostMapping("/{id}/pay")
    @PreAuthorize("hasRole('ADMIN')")
    public PayrollResponse pay(@PathVariable Long id) {
        return service.markPaid(id);
    }

    // The day-by-day working behind ONE payslip: what each day earned, what
    // each debt took, what was left.
    //
    // Admin-side view of the SAME computation the worker sees on their own
    // screen (/me/worker/daily). Abdul's phone showed "11 August, 30 kg, earned
    // ৳235, advance cut ৳215" and the admin console had no way to see any of
    // it -- so a dispute could not be settled from the office.
    //
    // Reads only. The payslip's own stored figures are unaffected.
    @GetMapping("/{id}/daily")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public Map<String, Object> daily(@PathVariable Long id) {
        return service.dailyFor(id);
    }

    @GetMapping("/config")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public PayrollConfigResponse getConfig() {
        return service.getConfig();
    }

    @PutMapping("/config")
    @PreAuthorize("hasRole('ADMIN')")
    public PayrollConfigResponse updateConfig(@Valid @RequestBody PayrollConfigRequest req, Authentication auth) {
        return service.updateConfig(req, auth != null ? auth.getName() : null);
    }
}
