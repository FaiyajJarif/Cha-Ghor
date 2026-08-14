package com.chaghor.chaghor.worker;

import com.chaghor.chaghor.worker.dto.MetaResponse;
import com.chaghor.chaghor.worker.dto.WorkerRequest;
import com.chaghor.chaghor.worker.dto.WorkerResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/workers")
@RequiredArgsConstructor
public class WorkerController {

    private final WorkerService workerService;

    // Admin + supervisor can view the workforce.
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<WorkerResponse> list(@RequestParam(required = false) String q) {
        return workerService.list(q);
    }

    // Dropdown data (supervisors + zones) for the create/edit form.
    @GetMapping("/meta")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public MetaResponse meta() {
        return workerService.meta();
    }

    // One worker's money day by day, for a date range (defaults to this month).
    //
    // THE SAME COMPUTATION the worker sees on their own phone, and the same one
    // the payslip review drawer uses. Reachable WITHOUT a payslip: the office
    // needs to answer "what did Abdul earn today" on a day when no payslip has
    // been generated yet, which is most days.
    //
    // A PROJECTION. Nothing here is deducted from any balance; loan.repaid and
    // the advance only move when a payslip is marked Paid.
    @GetMapping("/{id}/daily")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public java.util.Map<String, Object> daily(
            @PathVariable Long id,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return workerService.dailyFor(id, from, to);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public WorkerResponse get(@PathVariable Long id) {
        return workerService.get(id);
    }

    // Only admin can create / edit / remove workers.
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<WorkerResponse> create(@Valid @RequestBody WorkerRequest req) {
        return ResponseEntity.ok(workerService.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkerResponse update(@PathVariable Long id, @Valid @RequestBody WorkerRequest req) {
        return workerService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        workerService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
