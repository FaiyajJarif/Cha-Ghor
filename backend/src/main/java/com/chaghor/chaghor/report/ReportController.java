package com.chaghor.chaghor.report;

import jakarta.validation.Valid;
import com.chaghor.chaghor.report.dto.*;
import com.chaghor.chaghor.security.AppUserDetails;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

// REST surface for the Reports module. Reads are open to admin + supervisor;
// generating, finalizing and deleting reports are admin-only. RBAC is enforced
// per method with @PreAuthorize (no SecurityConfig change needed).
@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService service;

    public ReportController(ReportService service) {
        this.service = service;
    }

    // Estate-wide KPI rollup for a period (defaults to the current month).
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public ReportSummaryResponse summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodEnd) {
        return service.summary(periodStart, periodEnd);
    }

    // Monthly revenue / expense / profit series for the trend chart.
    @GetMapping("/trend")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<MonthlyPoint> trend(@RequestParam(defaultValue = "6") int months) {
        return service.trend(months);
    }

    // All saved reports, newest first.
    @GetMapping("/saved")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<SavedReportResponse> saved() {
        return service.saved();
    }

    // Generate + save a report snapshot for a period (admin only).
    @PostMapping("/generate")
    @PreAuthorize("hasRole('ADMIN')")
    public SavedReportResponse generate(@Valid @RequestBody(required = false) GenerateReportRequest req,
                                        @AuthenticationPrincipal AppUserDetails principal) {
        Long userId = principal == null ? null : principal.getUser().getId();
        return service.generate(req, userId);
    }

    // Lock a report (admin only).
    @PostMapping("/{id}/finalize")
    @PreAuthorize("hasRole('ADMIN')")
    public SavedReportResponse finalizeReport(@PathVariable Long id) {
        return service.finalizeReport(id);
    }

    // Delete a report (admin only).
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
