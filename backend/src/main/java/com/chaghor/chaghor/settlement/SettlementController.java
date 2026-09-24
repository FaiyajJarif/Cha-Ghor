package com.chaghor.chaghor.settlement;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
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

    // CLOSE TODAY EARLY, then settle it.
    //
    // Same work as /run, but it includes today instead of stopping at
    // yesterday. The office is declaring that the weighing is finished.
    //
    // This does NOT disable the 00:30 job, and it does not need to: the day is
    // now recorded, and daily_settlement is UNIQUE on (worker_id, work_date),
    // so tonight simply finds nothing left to do. Anything weighed in after the
    // close is picked up by SettlementRevisionService, which reverses the day
    // and re-settles it at the corrected figure.
    //
    // ADMIN ONLY -- deciding a day is over is an office decision, not a field
    // one. /run stays open to supervisors; this does not.
    @PostMapping("/close-today")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> closeToday() {
        return service.settleAll(true);
    }

    // THE DAY SHEET. Every worker's daily payslip for one date.
    //
    // Read-only and derived entirely from settlement rows, so a supervisor may
    // see it: it shows nothing they did not themselves record.
    //
    // `date` omitted defaults to yesterday -- the most recent day that is
    // certain to be closed. Defaulting to today would usually return an empty
    // sheet and read as a bug.
    @GetMapping("/day-sheet")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public Map<String, Object> daySheet(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.daySheet(date);
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
