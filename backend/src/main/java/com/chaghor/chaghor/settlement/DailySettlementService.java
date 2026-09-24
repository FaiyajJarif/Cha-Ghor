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
    private final com.chaghor.chaghor.finance.FinanceService financeService;

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
        return settleWorker(workerId, false);
    }

    // ========================================================================
    // includeToday = CLOSING THE DAY EARLY. USE DELIBERATELY.
    // ========================================================================
    //
    // Normally today is excluded: leaf can still be weighed and the register
    // amended, so the figure is not final and settling it would freeze a number
    // that is still moving.
    //
    // `includeToday` is the office saying "the weighing is finished, close it".
    // It exists because waiting until 00:30 to see real deductions on a payslip
    // makes the whole flow impossible to demonstrate or to correct in a sitting.
    //
    // IT IS SAFE FOR TWO REASONS, BOTH OF WHICH ALREADY EXISTED:
    //   * the 00:30 run cannot double it -- daily_settlement is UNIQUE on
    //     (worker_id, work_date), so an already-settled day is skipped;
    //   * leaf weighed in AFTER the close is not lost -- every leaf add, edit
    //     and delete calls SettlementRevisionService.onDayChanged(), which
    //     reverses the day and re-settles it at the corrected figure.
    //
    // So the worst case is a correction, not a wrong balance. It is still a
    // deliberate act, which is why it has its own endpoint and its own button
    // rather than quietly changing what "Run settlement" means.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public List<DailySettlement> settleWorker(Long workerId, boolean includeToday) {
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
        // Normally yesterday. `includeToday` closes the day early -- see the
        // contract above the overload.
        LocalDate to = includeToday ? today : today.minusDays(1);
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
            // Skip anything past the window. Without includeToday that is
            // "today or later"; with it, only genuinely future dates.
            boolean beyondWindow = includeToday
                    ? date != null && date.isAfter(today)
                    : date == null || !date.isBefore(today);
            if (date == null || beyondWindow) {
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
                // THE WAGE EXPENSE FOR MONEY ALREADY ADVANCED.
                //
                // No cash moves -- the worker is simply paid less today, and
                // the cash left when the advance was handed over. But the cost
                // is real and belongs to THIS day's work, so it is recognised
                // here. Over the life of an advance the expense recorded comes
                // to exactly the amount advanced.
                if (toAdvance.signum() > 0) {
                    financeService.postAdvanceRecovery(row.getId(), w.getFullName(),
                            toAdvance, date);
                }

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
        return settleAll(false);
    }

    // includeToday: see the settleWorker overload. The 00:30 job always passes
    // false; only the admin pressing "Close today" passes true.
    public Map<String, Object> settleAll(boolean includeToday) {
        int workers = 0;
        int daysSettled = 0;
        List<String> failures = new ArrayList<>();

        // WHAT THE RUN ACTUALLY MOVED, in taka.
        //
        // These are a SUM OF THE ROWS THIS RUN JUST WROTE. Nothing here decides
        // anything or recomputes anything -- settleWorker() has already done the
        // split and committed it, and this only adds up what it returned. If
        // these totals were ever computed a second, independent way they could
        // disagree with the rows, and then the screen would be arguing with the
        // database about a worker's loan.
        //
        // They exist because "settled 12 days across 4 workers" does not tell an
        // admin -- or an examiner -- whether any money moved. CLAUDE.md section 1
        // is "if a taka moves, there must be a row for it"; this is that sentence
        // made visible at the moment it happens.
        BigDecimal toLoan = BigDecimal.ZERO;
        BigDecimal toAdvance = BigDecimal.ZERO;
        BigDecimal toOverdraw = BigDecimal.ZERO;
        BigDecimal toPayable = BigDecimal.ZERO;

        for (Worker w : workerRepository.findByDeletedAtIsNull()) {
            try {
                List<DailySettlement> rows = settleWorker(w.getId(), includeToday);
                if (!rows.isEmpty()) {
                    workers++;
                    daysSettled += rows.size();
                    for (DailySettlement r : rows) {
                        toLoan = toLoan.add(nzq(r.getToLoan()));
                        toAdvance = toAdvance.add(nzq(r.getToAdvance()));
                        toOverdraw = toOverdraw.add(nzq(r.getToOverdraw()));
                        toPayable = toPayable.add(nzq(r.getPayable()));
                    }
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
        // Scale 2 HALF_UP, as every money value in this project is.
        out.put("toLoan", toLoan.setScale(2, RoundingMode.HALF_UP));
        out.put("toAdvance", toAdvance.setScale(2, RoundingMode.HALF_UP));
        out.put("toOverdraw", toOverdraw.setScale(2, RoundingMode.HALF_UP));
        out.put("toPayable", toPayable.setScale(2, RoundingMode.HALF_UP));
        out.put("failures", failures);
        return out;
    }

    // Local null-guard for the reporting sums above. Named nzq rather than nz so
    // it cannot be confused with, or accidentally merged into, the nz() the
    // settlement arithmetic itself uses.
    private static BigDecimal nzq(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
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

        int workers = workerRepository.findByDeletedAtIsNull().size();

        // ====================================================================
        // "BEHIND" MEANS THEY WORKED AND THE DAY IS NOT SETTLED.
        // ====================================================================
        //
        // This used to loop the workers and count anyone whose last settlement
        // was older than yesterday -- including anyone with NO settlement rows
        // at all. That produced an alarm that could never be cleared, and the
        // reason is three lines up in settleWorker(): a day with zero earnings
        // is deliberately not recorded, because an absent worker would
        // otherwise accumulate a row per day forever.
        //
        // So a worker who has not worked never gets a first row, is counted
        // behind, and STAYS counted behind no matter how many times the admin
        // presses Run settlement -- which correctly settles nothing each time.
        // The banner then tells them, untruthfully, that loan and advance
        // balances have not moved for those days. Nothing was owed on those
        // days; the worker was not there.
        //
        // The query asks the honest question instead: is there a day the
        // register calls present or late (or a day with leaf weighed in, which
        // can earn surplus on its own) that has no live settlement row?
        long behind = repo.countWorkersWithUnsettledWork();
        long unsettledDays = repo.countUnsettledWorkedDays();
        LocalDate oldest = repo.oldestUnsettledWorkedDay();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("lastClosedDay", lastClosedDay);
        out.put("settledYesterday", settledYesterday);
        out.put("activeWorkers", workers);
        out.put("workersBehind", behind);
        // How much work is actually outstanding, not just how many people.
        // One worker with 14 unsettled days and 14 workers with one day each
        // are very different situations and used to read identically.
        out.put("unsettledDays", unsettledDays);
        // The oldest day that genuinely needs settling. Replaces
        // oldestSettledAmongBehind, which reported the last day a behind worker
        // WAS settled -- a date that answered a question nobody asked.
        out.put("oldestUnsettledDay", oldest);
        return out;
    }

    @Transactional(readOnly = true)
    public List<DailySettlement> history(Long workerId, LocalDate from, LocalDate to) {
        return repo.findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(workerId, from, to);
    }

    // ========================================================================
    // THE DAY SHEET: every worker's payslip for ONE day.
    // ========================================================================
    //
    // The estate pays daily, so this -- not the monthly payroll row -- is the
    // slip that matches how the garden actually works. It reads the settlement
    // rows and nothing else.
    //
    // IT COMPUTES NOTHING. Every figure below was written by settleWorker when
    // the day was settled, and is the same number that moved loan.repaid. A
    // second, independent calculation here could disagree with the rows, and
    // then the printed slip would be arguing with the database about a wage.
    // If a figure looks wrong, the row is wrong, and the fix is to correct the
    // register or the weigh-in and let SettlementRevisionService re-settle.
    //
    // An unsettled day returns an EMPTY list, not zeroes. A zero row would say
    // "this worker earned nothing", which is a claim about their work; an empty
    // sheet says "this day has not been settled", which is a claim about the
    // system. Those are different sentences and only one of them is true.
    @Transactional(readOnly = true)
    public Map<String, Object> daySheet(LocalDate date) {
        LocalDate d = date != null ? date : LocalDate.now().minusDays(1);
        List<DailySettlement> rows = repo.findByWorkDate(d);

        Map<Long, Worker> byId = new LinkedHashMap<>();
        for (Worker w : workerRepository.findByDeletedAtIsNull()) {
            byId.put(w.getId(), w);
        }

        BigDecimal earned = BigDecimal.ZERO;
        BigDecimal toLoan = BigDecimal.ZERO;
        BigDecimal toAdvance = BigDecimal.ZERO;
        BigDecimal toOverdraw = BigDecimal.ZERO;
        BigDecimal payable = BigDecimal.ZERO;

        List<Map<String, Object>> slips = new ArrayList<>();
        for (DailySettlement r : rows) {
            // A reversed row is history: it was corrected, and the live row for
            // the same day is elsewhere in this list. Showing both would print
            // the day twice and double every total on the sheet.
            if (r.getReversedAt() != null) {
                continue;
            }
            Worker w = byId.get(r.getWorkerId());
            Map<String, Object> slip = new LinkedHashMap<>();
            slip.put("workerId", r.getWorkerId());
            slip.put("workerName", w == null ? "Worker #" + r.getWorkerId() : w.getFullName());
            slip.put("nameBn", w == null ? null : w.getNameBn());
            slip.put("jobRole", w == null ? null : w.getJobRole());
            slip.put("workDate", r.getWorkDate());
            slip.put("earned", nzq(r.getEarned()));
            slip.put("toLoan", nzq(r.getToLoan()));
            slip.put("toAdvance", nzq(r.getToAdvance()));
            slip.put("toOverdraw", nzq(r.getToOverdraw()));
            slip.put("payable", nzq(r.getPayable()));
            slips.add(slip);

            earned = earned.add(nzq(r.getEarned()));
            toLoan = toLoan.add(nzq(r.getToLoan()));
            toAdvance = toAdvance.add(nzq(r.getToAdvance()));
            toOverdraw = toOverdraw.add(nzq(r.getToOverdraw()));
            payable = payable.add(nzq(r.getPayable()));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("date", d);
        out.put("settled", !slips.isEmpty());
        out.put("workerCount", slips.size());
        out.put("slips", slips);
        out.put("totalEarned", earned.setScale(2, RoundingMode.HALF_UP));
        out.put("totalToLoan", toLoan.setScale(2, RoundingMode.HALF_UP));
        out.put("totalToAdvance", toAdvance.setScale(2, RoundingMode.HALF_UP));
        out.put("totalToOverdraw", toOverdraw.setScale(2, RoundingMode.HALF_UP));
        out.put("totalPayable", payable.setScale(2, RoundingMode.HALF_UP));
        return out;
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
