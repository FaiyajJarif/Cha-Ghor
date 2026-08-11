package com.chaghor.chaghor.settlement;

import com.chaghor.chaghor.notification.NotificationService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.Map;

// Settle everything outstanding the moment the application comes up.
//
// ============================================================================
// WHY THIS EXISTS
// ============================================================================
// The nightly job runs at 00:30. If the server is off at 00:30 -- a restart, a
// power cut, a laptop closed during a demo -- nothing settles, and the only
// signal is a "workers behind" count on a card nobody has open at midnight.
//
// NO DATA IS AT RISK either way. Attendance and leaf were committed by the
// supervisor long before; settlement only READS them and records a split. A
// missed night costs delay, not information. This just makes the delay end by
// itself instead of waiting for someone to notice and press a button.
//
// It is not a substitute for the schedule. It covers the gap the schedule
// cannot: the hours the process was not running.
//
// SAFE BY CONSTRUCTION. daily_settlement has a partial UNIQUE index on
// (worker_id, work_date) WHERE reversed_at IS NULL, so a day already settled is
// skipped no matter how many times this fires. Booting twice settles nothing
// twice.
@Component
@RequiredArgsConstructor
public class SettlementBootstrap {

    private static final Logger log = LoggerFactory.getLogger(SettlementBootstrap.class);

    private final DailySettlementService service;
    private final NotificationService notifications;

    // ApplicationReadyEvent, not CommandLineRunner: this must run after the
    // whole context including Flyway is up, or it would query daily_settlement
    // before a pending migration had added the columns it reads.
    @EventListener(ApplicationReadyEvent.class)
    public void catchUpOnStartup() {
        try {
            Map<String, Object> before = service.status();
            int behind = asInt(before.get("workersBehind"));
            if (behind == 0) {
                log.info("[settle] startup: nothing outstanding");
                return;
            }

            log.warn("[settle] startup: {} worker(s) not settled up to {} - catching up",
                    behind, before.get("lastClosedDay"));

            Map<String, Object> result = service.settleAll();
            int days = asInt(result.get("daysSettled"));
            int workers = asInt(result.get("workersSettled"));
            Object failures = result.get("failures");

            log.info("[settle] startup: settled {} day(s) across {} worker(s); failures: {}",
                    days, workers, failures);

            // TELL THE OFFICE IT HAPPENED. A silent catch-up is how a two-week
            // outage becomes invisible: the numbers quietly correct themselves
            // and nobody ever learns the schedule had stopped firing.
            if (days > 0) {
                try {
                    notifications.send("Settlement caught up",
                            "The estate was behind on daily settlement. " + days
                                    + (days == 1 ? " day" : " days") + " settled across "
                                    + workers + (workers == 1 ? " worker." : " workers."),
                            "settlement.caughtup", null);
                } catch (Exception ignored) {
                    // best-effort by design
                }
            }
        } catch (Exception e) {
            // NEVER STOP THE APPLICATION BOOTING. An estate that cannot open its
            // admin console because settlement failed is worse off than one
            // running a day behind.
            log.error("[settle] startup catch-up failed: {}", e.toString());
        }
    }

    private static int asInt(Object o) {
        return (o instanceof Number n) ? n.intValue() : 0;
    }
}
