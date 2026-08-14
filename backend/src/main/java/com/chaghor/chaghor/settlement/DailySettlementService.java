package com.chaghor.chaghor.settlement;

import com.chaghor.chaghor.loan.LoanService;
import com.chaghor.chaghor.web.DailyLedgerService;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Settles a worker's completed days: earnings split between loan, advance and
// what the estate now owes them.
//
// ============================================================================
// THIS IS WHERE DEBT ACTUALLY MOVES. NOTHING ELSE SHOULD.
// ============================================================================
//
// Before this, `loan.repaid` and the advance balance only changed when a
// MONTHLY payslip was marked paid. On an estate that pays daily that produced
// three failures in a row, all of them real:
//
//   * a payslip paid on the 7th for a period ending the 31st locked the
//     remaining 24 days of work out of payroll permanently;
//   * an advance paid out with no editable payslip could never be recovered;
//   * the worker's screen said ৳20/day was coming off their loan while the
//     loan balance sat unchanged for weeks.
//
// Now a day is settled once, on its own, and the payslip is only a statement.
//
// ---------------------------------------------------------------------------
// WHAT SETTLING DOES AND DOES NOT DO
// ---------------------------------------------------------------------------
// DOES:   record the day, move loan.repaid, reduce the outstanding advance.
// DOES NOT: move cash. No taka leaves the estate here. The worker is now OWED
//         `payable`; they receive it when they withdraw, through
//         WithdrawalService, which is the only place that posts cash out.
//
// ---------------------------------------------------------------------------
// SETTLE ONCE, AND ONLY COMPLETED DAYS
// ---------------------------------------------------------------------------
// Today is never settled: leaf can still be weighed in and the register can
// still be amended, so today's figure is not final. Only dates strictly before
// today are eligible.
//
// Idempotency is enforced by the database, not by this class being careful:
// daily_settlement has UNIQUE (worker_id, work_date). A concurrent or repeated
// run hits the constraint and that day is skipped. Being careful in code is how
// you get a double deduction under a race; a constraint is how you do not.
@Service
@RequiredArgsConstructor
public class DailySettlementService {

    private static final Logger log = LoggerFactory.getLogger(DailySettlementService.class);

    private final DailySettlementRepository repo;
    private final DailyLedgerService dailyLedger;
    private final WorkerRepository workerRepository;
    private final LoanService loanService;
    private final WageOverdrawRepository overdrawRepository;

    // How far back to look for unsettled days. A worker who has not been
    // settled for longer than this needs someone to look at why, not a silent
    // catch-up that quietly recovers three months of loan in one pass.
    private static final int MAX_CATCHUP_DAYS = 60;

    // ---- one worker ---------------------------------------------------------

    // Settle every completed, unsettled day for one worker. Returns the days
    // it actually settled.
    //
    // REQUIRES_NEW so one worker's failure cannot roll back another's in a
    // batch run. A worker whose loan row is malformed must not stop the estate.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public List<DailySettlement> settleWorker(Long workerId) {
        Worker w = workerRepository.findById(workerId).orElse(null);
        if (w == null) {
            return List.of();
        }

        LocalDate today = LocalDate.now();
        LocalDate lastSettled = repo
                .findFirstByWorkerIdAndReversedAtIsNullOrderByWorkDateDesc(workerId)
                .map(DailySettlement::getWorkDate)
                .orElse(null);

        // Resume the day after the last settlement, or start MAX_CATCHUP_DAYS
        // back for a worker who has never been settled.
        LocalDate from = lastSettled != null
                ? lastSettled.plusDays(1)
                : today.minusDays(MAX_CATCHUP_DAYS);
        LocalDate to = today.minusDays(1);      // never settle today
        if (from.isAfter(to)) {
            return List.of();
        }
        if (from.isBefore(today.minusDays(MAX_CATCHUP_DAYS))) {
            log.warn("[settle] worker {} last settled {}, older than the {}-day window; "
                            + "starting from {}", workerId, lastSettled, MAX_CATCHUP_DAYS, from);
        }

        // The ledger is the arithmetic; this class is the record. Both read the
        // same attendance and leaf rows, so a settled day can always be
        // reconciled against what the worker was shown.
        Map<String, Object> ledger = dailyLedger.ledger(w, from, to);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> days = (List<Map<String, Object>>) ledger.get("days");
        if (days == null || days.isEmpty()) {
            return List.of();
        }

        List<DailySettlement> settled = new ArrayList<>();
        for (Map<String, Object> d : days) {
            LocalDate date = (LocalDate) d.get("date");
            if (date == null || !date.isBefore(today)) {
                continue;
            }
            BigDecimal earned = money(d.get("earned"));
            // A day with no earnings settles to nothing. Recording a zero row
            // would still be honest, but it would also mean an absent worker
            // accumulates a row per day forever for no reason.
            if (earned.signum() <= 0) {
                continue;
            }
            if (repo.findByWorkerIdAndWorkDateAndReversedAtIsNull(workerId, date)
                    .isPresent()) {
                continue;
            }

            BigDecimal toLoan = money(d.get("toLoan"));
            BigDecimal toAdvance = money(d.get("toAdvance"));
            BigDecimal toOverdraw = money(d.get("toOverdraw"));
            BigDecimal payable = money(d.get("payable"));

            // The CHECK constraint enforces this too, but failing here names
            // the worker and the day instead of surfacing a constraint error.
            BigDecimal sum = toLoan.add(toAdvance).add(toOverdraw).add(payable);
            if (sum.compareTo(earned) != 0) {
                log.error("[settle] worker {} {}: split {} does not equal earned {}; skipped",
                        workerId, date, sum, earned);
                continue;
            }

            try {
                DailySettlement row = repo.save(DailySettlement.builder()
                        .workerId(workerId)
                        .workDate(date)
                        .earned(earned)
                        .toLoan(toLoan)
                        .toAdvance(toAdvance)
                        .toOverdraw(toOverdraw)
                        .payable(payable)
                        .build());

                // THE DEBT MOVES HERE, and only after the row exists. If the
                // insert lost a race, the constraint threw and we never touch
                // the loan -- which is the whole point of doing it in this
                // order rather than the other way round.
                if (toLoan.signum() > 0) {
                    // row.getId() is what lets a later correction reverse
                    // EXACTLY these repayments, and what tells the cashOnHand
                    // rollup this money was withheld from wages rather than
                    // handed over in notes.
                    loanService.recover(workerId, toLoan, date, null, row.getId(),
                            "Recovered from " + date + "'s earnings");
                }

                // Working off an overpayment from a day corrected after it was
                // settled. Oldest correction first, so "which day is this for"
                // has an answer.
                if (toOverdraw.signum() > 0) {
                    BigDecimal rem = toOverdraw;
                    for (var o : overdrawRepository.findOpenByWorker(workerId)) {
                        if (rem.signum() <= 0) break;
                        BigDecimal owed = nz(o.getAmount()).subtract(nz(o.getRecovered()));
                        if (owed.signum() <= 0) continue;
                        BigDecimal take = rem.min(owed);
                        o.setRecovered(nz(o.getRecovered()).add(take));
                        overdrawRepository.save(o);
                        rem = rem.subtract(take);
                    }
                    if (rem.signum() > 0) {
                        // The projection said there was more to recover than the
                        // table holds. Loud, because it means the day's split and
                        // the debt disagree.
                        log.error("[settle] worker {} {}: {} of overdraw recovery had "
                                + "nowhere to go", workerId, date, rem);
                    }
                }
                settled.add(row);
            } catch (DataIntegrityViolationException e) {
                // Another run settled this day first. Correct outcome, not an
                // error: the day is settled exactly once either way.
                log.debug("[settle] worker {} {} already settled by another run", workerId, date);
            }
        }
        return settled;
    }

    // ---- everyone -----------------------------------------------------------

    // Settle every active worker. Each runs in its own transaction, so one bad
    // row cannot stop the estate being settled.
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Map<String, Object> settleAll() {
        int workers = 0;
        int daysSettled = 0;
        List<String> failures = new ArrayList<>();

        for (Worker w : workerRepository.findByDeletedAtIsNull()) {
            try {
                List<DailySettlement> rows = settleWorker(w.getId());
                if (!rows.isEmpty()) {
                    workers++;
                    daysSettled += rows.size();
                }
            } catch (Exception e) {
                // Named, not swallowed. A worker who cannot be settled is a
                // worker who is not being paid correctly.
                log.error("[settle] worker {} ({}) failed: {}",
                        w.getId(), w.getFullName(), e.toString());
                failures.add(w.getFullName() + " (#" + w.getId() + ")");
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("workersSettled", workers);
        out.put("daysSettled", daysSettled);
        out.put("failures", failures);
        return out;
    }

    // ---- what the worker is owed -------------------------------------------

    // Everything settled and not yet withdrawn is what the estate owes.
    // Deliberately NOT computed from the ledger: the ledger is a projection and
    // includes today, which is not final. This reads settled rows only.
    @Transactional(readOnly = true)
    public BigDecimal accruedPayable(Long workerId, LocalDate from, LocalDate to) {
        BigDecimal total = BigDecimal.ZERO;
        for (DailySettlement s : repo.findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(
                workerId, from, to)) {
            total = total.add(nz(s.getPayable()));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    // ---- how far behind is settlement? --------------------------------------

    // What an admin needs before pressing a button: is yesterday done, and if
    // not, how many workers are waiting. A button with no state behind it is
    // how you get somebody clicking it five times.
    //
    // "Behind" is measured against YESTERDAY, not today. Today is deliberately
    // never settled -- leaf can still be weighed in -- so treating today as
    // outstanding would show a permanent red count that never clears.
    @Transactional(readOnly = true)
    public Map<String, Object> status() {
        LocalDate lastClosedDay = LocalDate.now().minusDays(1);
        int settledYesterday = repo.findByWorkDate(lastClosedDay).size();

        int workers = 0;
        int behind = 0;
        LocalDate oldest = null;
        for (Worker w : workerRepository.findByDeletedAtIsNull()) {
            workers++;
            LocalDate last = repo.findFirstByWorkerIdOrderByWorkDateDesc(w.getId())
                    .map(DailySettlement::getWorkDate)
                    .orElse(null);
            if (last == null || last.isBefore(lastClosedDay)) {
                behind++;
                // A never-settled worker has no date to report; the oldest
                // outstanding day is what matters, and only settled workers
                // can supply one.
                if (last != null && (oldest == null || last.isBefore(oldest))) {
                    oldest = last;
                }
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("lastClosedDay", lastClosedDay);
        out.put("settledYesterday", settledYesterday);
        out.put("activeWorkers", workers);
        out.put("workersBehind", behind);
        out.put("oldestSettledAmongBehind", oldest);
        return out;
    }

    @Transactional(readOnly = true)
    public List<DailySettlement> history(Long workerId, LocalDate from, LocalDate to) {
        return repo.findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(workerId, from, to);
    }

    // ---- helpers ------------------------------------------------------------

    private static BigDecimal money(Object o) {
        if (o instanceof BigDecimal b) {
            return b.setScale(2, RoundingMode.HALF_UP);
        }
        if (o instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue()).setScale(2, RoundingMode.HALF_UP);
        }
        return BigDecimal.ZERO;
    }

    private static BigDecimal nz(BigDecimal b) {
        return b != null ? b : BigDecimal.ZERO;
    }
}
