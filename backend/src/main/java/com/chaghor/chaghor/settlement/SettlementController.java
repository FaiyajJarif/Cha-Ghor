package com.chaghor.chaghor.settlement;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

// Runs settlement, and lets an admin run it on demand.
//
// WHY A SCHEDULE AND A BUTTON
//   The schedule is what makes daily settlement actually daily -- without it
//   the whole model is inert and nothing ever moves. The button exists because
//   a demo, a restarted server or a missed night must not leave a worker's loan
//   frozen until tomorrow, and because "run it and show me what happened" is
//   the only way to see that it works.
//
// SAFE TO RUN AS OFTEN AS YOU LIKE. Settlement is idempotent by database
// constraint: daily_settlement is UNIQUE on (worker_id, work_date), so a second
// run in the same day settles nothing twice.
@RestController
@RequestMapping("/api/v1/settlement")
public class SettlementController {

    private final DailySettlementService service;

    public SettlementController(DailySettlementService service) {
        this.service = service;
    }

    // 00:30 local, every day. Late enough that the previous day is closed --
    // settlement only ever touches dates strictly before today, so the exact
    // minute matters far less than being after midnight.
    @Scheduled(cron = "0 30 0 * * *")
    public void nightly() {
        service.settleAll();
    }

    // Run it now. Returns what it did, including any worker it could not settle
    // -- a worker who silently fails to settle is a worker whose loan is not
    // being repaid.
    @PostMapping("/run")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> run() {
        return service.settleAll();
    }

    // How far behind settlement is. Read-only, safe for any office user.
    @GetMapping("/status")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public Map<String, Object> status() {
        return service.status();
    }

    // One worker, for when the office is looking at a specific dispute.
    @PostMapping("/run/{workerId}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public Map<String, Object> runOne(@PathVariable Long workerId) {
        var rows = service.settleWorker(workerId);
        return Map.of("workerId", workerId, "daysSettled", rows.size());
    }
}
