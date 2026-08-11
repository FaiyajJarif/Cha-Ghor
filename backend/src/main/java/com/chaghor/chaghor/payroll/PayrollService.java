package com.chaghor.chaghor.payroll;

import com.chaghor.chaghor.attendance.Attendance;
import com.chaghor.chaghor.attendance.AttendanceRepository;
import com.chaghor.chaghor.audit.AuditService;
import com.chaghor.chaghor.attendance.AttendanceStatus;
import com.chaghor.chaghor.leaf.LeafCollection;
import com.chaghor.chaghor.leaf.LeafCollectionRepository;
import com.chaghor.chaghor.leaf.LeafGrade;
import com.chaghor.chaghor.payroll.dto.*;
import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

// The payroll engine. Everything money-related lives here:
//  - the wage formula (recompute)
//  - the Draft -> Review -> Approved -> Paid state machine (guarded transitions)
//  - config (the rate knobs) read/write
// Foreign keys are plain Long columns (same style as Worker/Attendance); we
// resolve worker/zone names in-memory for the response.
@Service
@RequiredArgsConstructor
public class PayrollService {

    private final PayrollRepository payrollRepository;
    private final PayrollConfigRepository configRepository;
    private final WorkerRepository workerRepository;
    private final ZoneRepository zoneRepository;
    private final UserRepository userRepository;
    private final AttendanceRepository attendanceRepository;
    private final LeafCollectionRepository leafCollectionRepository;
    private final com.chaghor.chaghor.sms.SmsService smsService;
    // v10
    private final PendingRecoveryRepository pendingRecoveryRepository;
    private final com.chaghor.chaghor.audit.AuditService auditService;
    private final com.chaghor.chaghor.notification.NotificationService notifications;
    private final com.chaghor.chaghor.web.DailyLedgerService dailyLedger;
    private final com.chaghor.chaghor.settlement.DailySettlementRepository settlementRepository;

    // ---- Reads -------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<PayrollResponse> list(LocalDate start, LocalDate end, String status) {
        LocalDate[] period = resolve(start, end);
        List<Payroll> rows;
        if (hasText(status)) {
            rows = payrollRepository.findByPeriodStartAndPeriodEndAndStatusOrderByIdAsc(
                    period[0], period[1], parseStatus(status));
        } else {
            rows = payrollRepository.findByPeriodStartAndPeriodEndOrderByIdAsc(period[0], period[1]);
        }
        Map<Long, Worker> workers = workerMap();
        Map<Long, String> zones = zoneMap();
        Map<Long, Register> register = registerFor(period[0], period[1]);
        // A worker whose attendance and leaf were ALL deleted has no entry
        // above, and a null entry means "do not compare" -- so the one payslip
        // most obviously out of date would be the only one never flagged. Give
        // every payslip's worker a zero row so the comparison always happens.
        for (Payroll r : rows) {
            register.putIfAbsent(r.getWorkerId(), new Register(
                    0, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO));
        }
        return rows.stream().map(p -> toResponse(p, workers, zones, register)).toList();
    }

    // The whole register for the period in TWO queries, grouped in memory.
    //
    // The obvious version asks the database per worker inside the row loop,
    // which is 2N queries to render one table. This follows the pattern the
    // rest of the codebase already uses for names -- workerMap(), zoneMap() --
    // and resolves in the service layer instead.
    private Map<Long, Register> registerFor(LocalDate start, LocalDate end) {
        PayrollConfig cfg = currentConfig();
        BigDecimal quota = nz(cfg.getLeafQuotaKg());

        Map<Long, Integer> days = new HashMap<>();
        for (Attendance a : attendanceRepository.findByWorkDateBetween(start, end)) {
            // late pays a full day, exactly as recompute() counts it. Using a
            // different rule here would report every late worker as stale.
            if (a.getStatus() == AttendanceStatus.present
                    || a.getStatus() == AttendanceStatus.late) {
                days.merge(a.getWorkerId(), 1, Integer::sum);
            }
        }

        Map<Long, BigDecimal> total = new HashMap<>();
        Map<Long, BigDecimal> gradeA = new HashMap<>();
        // Surplus is measured PER DAY -- a 40 kg day must not be cancelled by a
        // 10 kg one -- so the per-day totals have to be built before the quota
        // is applied.
        Map<Long, Map<LocalDate, BigDecimal>> perDay = new HashMap<>();
        for (LeafCollection lc : leafCollectionRepository.findByCollectDateBetween(start, end)) {
            Long wid = lc.getWorkerId();
            BigDecimal kg = nz(lc.getWeightKg());
            total.merge(wid, kg, BigDecimal::add);
            if (lc.getQualityGrade() == LeafGrade.A) {
                gradeA.merge(wid, kg, BigDecimal::add);
            }
            perDay.computeIfAbsent(wid, k -> new HashMap<>())
                  .merge(lc.getCollectDate(), kg, BigDecimal::add);
        }

        Map<Long, Register> out = new HashMap<>();
        Set<Long> ids = new HashSet<>();
        ids.addAll(days.keySet());
        ids.addAll(total.keySet());
        for (Long wid : ids) {
            BigDecimal surplusKg = BigDecimal.ZERO;
            for (BigDecimal dayKg : perDay.getOrDefault(wid, Map.of()).values()) {
                BigDecimal over = dayKg.subtract(quota);
                if (over.signum() > 0) {
                    surplusKg = surplusKg.add(over);
                }
            }
            out.put(wid, new Register(
                    days.getOrDefault(wid, 0),
                    total.getOrDefault(wid, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP),
                    surplusKg,
                    gradeA.getOrDefault(wid, BigDecimal.ZERO)));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public PayrollSummaryResponse summary(LocalDate start, LocalDate end) {
        LocalDate[] period = resolve(start, end);
        List<Payroll> rows = payrollRepository.findByPeriodStartAndPeriodEndOrderByIdAsc(period[0], period[1]);
        int draft = 0, review = 0, approved = 0, paid = 0;
        BigDecimal gross = BigDecimal.ZERO, net = BigDecimal.ZERO;
        for (Payroll p : rows) {
            switch (p.getStatus()) {
                case draft -> draft++;
                case review -> review++;
                case approved -> approved++;
                case paid -> paid++;
            }
            gross = gross.add(nz(p.getGrossAmount()));
            net = net.add(nz(p.getNetPayable()));
        }
        return new PayrollSummaryResponse(period[0], period[1], rows.size(), draft, review, approved, paid, gross, net);
    }

    // Net-pay total per period, oldest -> newest, capped to `limit` periods.
    @Transactional(readOnly = true)
    public List<TrendPoint> trend(int limit) {
        int capped = Math.max(1, Math.min(limit, 60));
        List<TrendPoint> points = payrollRepository.findNetTrend(PageRequest.of(0, capped));
        // repository returns newest-first; reverse so the chart reads left -> right in time
        Collections.reverse(points);
        return points;
    }

    // v10: advances paid out that no payslip has absorbed yet.
    @Transactional(readOnly = true)
    // LEGACY, AND NOTHING WRITES TO IT ANY MORE.
    //
    // payroll_pending_recovery parked an advance when there was no editable
    // payslip to net it off. Daily settlement removed the need: an advance is
    // recovered from the withdrawal row itself, day by day, whether or not a
    // payslip exists.
    //
    // The rows already in the table are therefore NOT outstanding debt -- the
    // same advances are being recovered daily -- and any banner that presents
    // them as money owed is now double-counting. Kept readable so the history
    // is not lost, but it needs retiring from the UI.
    public PendingRecoveryResponse pendingRecoveries() {
        List<PendingRecovery> open = pendingRecoveryRepository.findByAppliedAtIsNullOrderByIdAsc();
        Map<Long, Worker> workers = workerMap();
        List<PendingRecoveryResponse.Item> items = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (PendingRecovery r : open) {
            Worker w = workers.get(r.getWorkerId());
            items.add(new PendingRecoveryResponse.Item(
                    r.getId(), r.getWorkerId(),
                    w != null ? w.getFullName() : "Worker #" + r.getWorkerId(),
                    nz(r.getAmount()), r.getSourceType(), r.getSourceId(),
                    r.getNote(), r.getCreatedAt()));
            total = total.add(nz(r.getAmount()));
        }
        return new PendingRecoveryResponse(items.size(), total, items);
    }

    // ---- Generate a cycle --------------------------------------------------

    // Idempotent: (re)creates a Draft payslip for every ACTIVE worker in the
    // period, computed from their attendance. A row that has already left Draft
    // (review/approved/paid) is never touched, so re-running is always safe.
    @Transactional
    public com.chaghor.chaghor.payroll.dto.GenerateResult generate(LocalDate start, LocalDate end) {
        LocalDate[] period = resolve(start, end);
        PayrollConfig cfg = currentConfig();
        List<com.chaghor.chaghor.payroll.dto.GenerateResult.Skipped> skipped = new ArrayList<>();
        // Live workers only: a retired worker (deleted_at stamped) must never be
        // issued a NEW payslip. Their existing ones are untouched -- this is the
        // "who works here now" question, not "whose history is this".
        for (Worker w : workerRepository.findByDeletedAtIsNull()) {
            if (!"active".equalsIgnoreCase(w.getStatus())) {
                // SKIPPED, BUT NOT SILENTLY. Record who and why, and whether
                // they actually worked -- an on_leave worker whose register
                // says "present" has done work nobody is paying for.
                boolean worked = !attendanceRepository
                        .findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(
                                w.getId(), period[0], period[1]).isEmpty()
                        || !leafCollectionRepository
                        .findByWorkerIdAndCollectDateBetween(
                                w.getId(), period[0], period[1]).isEmpty();
                skipped.add(new com.chaghor.chaghor.payroll.dto.GenerateResult.Skipped(
                        w.getId(), w.getFullName(), w.getStatus(), worked,
                        worked
                                ? "Status is '" + w.getStatus() + "', but this worker has "
                                        + "attendance or leaf recorded in this period."
                                : "Status is '" + w.getStatus() + "'."));
                continue;
            }
            Payroll p = payrollRepository
                    .findByWorkerIdAndPeriodStartAndPeriodEnd(w.getId(), period[0], period[1])
                    .orElse(null);
            if (p == null) {
                p = Payroll.builder()
                        .workerId(w.getId())
                        .periodStart(period[0])
                        .periodEnd(period[1])
                        .status(PayrollStatus.draft)
                        .build();
            }
            // NO STATUS GUARD. A payslip is a statement of days already settled,
            // so regenerating it can only ever make it MORE accurate.
            //
            // The guard used to read `else if (status != draft) continue;` and
            // it did real damage: a payslip approved and paid on the 7th for a
            // period ending the 31st locked the remaining 24 days of work out of
            // payroll permanently. That worker's page showed ৳0 for a month of
            // picking and there was no way to unstick it. Since no money is
            // moved by the payslip any more, there is nothing left to protect.
            recompute(p, w, cfg, period[0], period[1]);
            payrollRepository.save(p);
        }
        return new com.chaghor.chaghor.payroll.dto.GenerateResult(
                list(period[0], period[1], null), skipped);
    }

    // ---- Deductions --------------------------------------------------------

    @Transactional
    public PayrollResponse updateDeductions(Long id, DeductionRequest req) {
        Payroll p = require(id);
        if (p.getStatus() != PayrollStatus.draft && p.getStatus() != PayrollStatus.review) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Deductions can only be edited while a payslip is in Draft or Review.");
        }
        // loanDeduction and advanceRecovery are DERIVED from daily_settlement
        // and are rewritten by every recompute. Accepting a hand-typed value
        // here would look like it saved and then vanish on the next generate,
        // which is worse than refusing it. Ignored on purpose, not forgotten.
        //
        // Not thrown as an error: the existing deductions form posts all three
        // fields together, and failing the whole save would block a legitimate
        // otherDeduction edit.
        if (req.otherDeduction() != null) {
            p.setOtherDeduction(req.otherDeduction());
        }
        recomputeNet(p);
        payrollRepository.save(p);
        return toResponse(p, null, null);
    }

    // ---- State machine -----------------------------------------------------

    @Transactional
    public PayrollResponse submitForReview(Long id) {
        return transition(id, PayrollStatus.draft, PayrollStatus.review, null);
    }

    @Transactional
    public PayrollResponse approve(Long id, String username) {
        Long uid = userId(username);
        PayrollResponse resp =
                transition(id, PayrollStatus.review, PayrollStatus.approved, p -> p.setApprovedBy(uid));
        auditService.recordTransition("payroll", id, "review", "approved",
                AuditService.details("netPayable", resp.netPayable(),
                        "workerId", resp.workerId()));
        return resp;
    }

    @Transactional
    public PayrollResponse markPaid(Long id) {
        PayrollResponse resp = transition(id, PayrollStatus.approved, PayrollStatus.paid,
                p -> p.setPaidAt(OffsetDateTime.now()));
        Payroll p = require(id);

        // ====================================================================
        // MARKING A PAYSLIP PAID NO LONGER MOVES ANY MONEY.
        // ====================================================================
        //
        // The estate pays DAILY. This method used to be the payment event: it
        // posted the net to Finance, recovered the loan and settled advances.
        // All three now happen elsewhere, and doing them here as well would
        // charge the worker twice for the same work:
        //
        //   cash out  -> WithdrawalService, when the worker actually withdraws.
        //                The taka reaches their bKash there, and postWithdrawal
        //                is what records it leaving. Posting the net here too
        //                would double the estate's payroll expense.
        //   loan       -> DailySettlementService, day by day, at the loan's own
        //                daily rate. loan.repaid already moved.
        //   advance    -> the same daily settlement, via to_advance.
        //
        // What is left is a status change on a statement. That is all this is
        // meant to be, and it is why a payslip can no longer freeze a period.

        LocalDate closedOn = p.getPaidAt() != null
                ? p.getPaidAt().toLocalDate()
                : LocalDate.now();

        // Tell the worker their statement is final. Deliberately NOT "your
        // salary has been paid" any more -- it has not, and saying so would be
        // the system lying to somebody who is waiting on money. Their wages
        // reached them daily as they withdrew.
        smsService.notifyPayrollClosed(p.getWorkerId(), p.getNetPayable());

        // Tell every open screen, so the worker is not left refreshing.
        // Best-effort and last: a socket failure must never fail a commit.
        try {
            notifications.send("বেতনের হিসাব চূড়ান্ত",
                    "এই মাসের হিসাব চূড়ান্ত করা হয়েছে।", "payroll.saved", p.getId());
        } catch (Exception ignored) {
            // best-effort by design, exactly as FieldCaseService.push is
        }

        // No cash moves here now, but closing a worker's month is still the
        // record everyone will argue from later. Record who closed it.
        auditService.recordTransition("payroll", id, "approved", "paid",
                AuditService.details("netPayable", nz(p.getNetPayable()),
                        "loanDeduction", nz(p.getLoanDeduction()),
                        "workerId", p.getWorkerId(),
                        "closedOn", closedOn.toString()));
        return resp;
    }

    private PayrollResponse transition(Long id, PayrollStatus from, PayrollStatus to, Consumer<Payroll> onOk) {
        Payroll p = require(id);
        if (p.getStatus() != from) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cannot move a " + p.getStatus() + " payslip to " + to + ". Expected it to be " + from + ".");
        }
        p.setStatus(to);
        if (onOk != null) {
            onOk.accept(p);
        }
        payrollRepository.save(p);
        return toResponse(p, null, null);
    }

    // The daily ledger behind one payslip, for the admin review drawer.
    //
    // Delegates to DailyLedgerService so the office and the worker are looking
    // at ONE computation. Two implementations of "what did this day pay" is how
    // a screen ends up disagreeing with a payslip.
    @Transactional(readOnly = true)
    public Map<String, Object> dailyFor(Long payrollId) {
        Payroll p = payrollRepository.findById(payrollId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "That payslip could not be found."));
        Worker w = workerRepository.findById(p.getWorkerId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "That payslip's worker no longer exists."));
        return dailyLedger.ledger(w, p.getPeriodStart(), p.getPeriodEnd());
    }

    // ---- Config ------------------------------------------------------------

    @Transactional(readOnly = true)
    public PayrollConfigResponse getConfig() {
        return toConfigResponse(currentConfig());
    }

    @Transactional
    public PayrollConfigResponse updateConfig(PayrollConfigRequest req, String username) {
        PayrollConfig c = configRepository.findTopByOrderByEffectiveFromDescIdDesc()
                .orElseGet(this::defaultConfig);
        // Snapshot the rates BEFORE they are overwritten, for the audit row.
        Map<String, Object> before = AuditService.details(
                "baseDailyWage", nz(c.getBaseDailyWage()),
                "leafQuotaKg", nz(c.getLeafQuotaKg()),
                "surplusRate", nz(c.getSurplusRate()),
                "gradeBonusRate", nz(c.getGradeBonusRate()),
                "advanceCap", nz(c.getAdvanceCap()),
                "loanCap", nz(c.getLoanCap()),
                "loanDailyDeduction", nz(c.getLoanDailyDeduction()));
        if (req.baseDailyWage() != null) {
            c.setBaseDailyWage(req.baseDailyWage());
        }
        if (req.leafQuotaKg() != null) {
            c.setLeafQuotaKg(req.leafQuotaKg());
        }
        if (req.surplusRate() != null) {
            c.setSurplusRate(req.surplusRate());
        }
        if (req.gradeBonusRate() != null) {
            c.setGradeBonusRate(req.gradeBonusRate());
        }
        // Raising a limit lets every worker borrow more from the next request
        // onward; LOWERING one never claws back an advance already taken, so a
        // worker can legitimately sit above the cap until they have repaid.
        // Nothing here recomputes an existing payslip.
        if (req.advanceCap() != null) {
            c.setAdvanceCap(req.advanceCap());
        }
        if (req.loanCap() != null) {
            c.setLoanCap(req.loanCap());
        }
        if (req.loanDailyDeduction() != null) {
            c.setLoanDailyDeduction(req.loanDailyDeduction());
        }
        c.setEffectiveFrom(LocalDate.now());
        c.setUpdatedBy(userId(username));
        configRepository.save(c);

        // Changing a rate silently re-prices every payslip generated afterwards,
        // so the old and new values both go on the record.
        auditService.record("UPDATE", "payroll_config", c.getId(), before,
                AuditService.details("baseDailyWage", nz(c.getBaseDailyWage()),
                        "leafQuotaKg", nz(c.getLeafQuotaKg()),
                        "surplusRate", nz(c.getSurplusRate()),
                        "gradeBonusRate", nz(c.getGradeBonusRate())));
        return toConfigResponse(c);
    }

    // ---- Wage formula ------------------------------------------------------

    // base   = present days (from attendance) x the worker's own daily wage
    //          (falls back to the config base wage when a worker's wage is null)
    // surplus    = kg plucked ABOVE the daily quota x surplusRate, measured per
    //          DAY then summed over the period (a heavy day is not cancelled by
    //          a light one).
    // gradeBonus = every kg graded 'A' x gradeBonusRate.
    //          Both are sourced from the Leaf Collection module for this period.
    private void recompute(Payroll p, Worker w, PayrollConfig cfg, LocalDate start, LocalDate end) {
        // Base pay counts PRESENT + LATE.
        //
        // V22 added the `late` status and nothing here was told about it, so a
        // worker marked late silently earned zero base for that day -- a full
        // day's wage lost for arriving behind time. They did the day's work;
        // lateness is a discipline matter, not a wage cut, and the minutes are
        // recorded on the row (V24) for whoever wants to act on the pattern.
        long present = attendanceRepository.countByWorkerIdAndWorkDateBetweenAndStatus(
                w.getId(), start, end, AttendanceStatus.present)
                + attendanceRepository.countByWorkerIdAndWorkDateBetweenAndStatus(
                w.getId(), start, end, AttendanceStatus.late);
        BigDecimal wage = w.getDailyWage() != null ? w.getDailyWage() : cfg.getBaseDailyWage();
        BigDecimal base = wage.multiply(BigDecimal.valueOf(present));

        // ---- Leaf incentives (Phase 2 completion) ----
        BigDecimal quota = nz(cfg.getLeafQuotaKg());
        Map<LocalDate, BigDecimal> kgPerDay = new HashMap<>();
        BigDecimal gradeAKg = BigDecimal.ZERO;
        for (LeafCollection lc : leafCollectionRepository
                .findByWorkerIdAndCollectDateBetween(w.getId(), start, end)) {
            BigDecimal kg = nz(lc.getWeightKg());
            kgPerDay.merge(lc.getCollectDate(), kg, BigDecimal::add);
            if (lc.getQualityGrade() == LeafGrade.A) {
                gradeAKg = gradeAKg.add(kg);
            }
        }
        BigDecimal surplusKg = BigDecimal.ZERO;
        for (BigDecimal dayKg : kgPerDay.values()) {
            BigDecimal over = dayKg.subtract(quota);
            if (over.signum() > 0) {
                surplusKg = surplusKg.add(over);
            }
        }
        BigDecimal surplus = surplusKg.multiply(nz(cfg.getSurplusRate())).setScale(2, RoundingMode.HALF_UP);
        BigDecimal bonus = gradeAKg.multiply(nz(cfg.getGradeBonusRate())).setScale(2, RoundingMode.HALF_UP);

        p.setPresentDays((int) present);
        p.setBaseAmount(base);
        p.setSurplusAmount(surplus);
        p.setGradeBonus(bonus);
        p.setGrossAmount(base.add(surplus).add(bonus));

        // v10: the loan instalment is no longer typed by hand. Every outstanding
        // loan contributes dailyDeduction x present days, capped at what is
        // still owed. Recomputed on every generate, so a hand-typed override on
        // a Draft row is intentionally replaced -- edit it after generating, or
        // change the loan's daily deduction if the change should be permanent.
        // ====================================================================
        // DEDUCTIONS ARE REPORTED, NOT FORECAST.
        // ====================================================================
        //
        // This line used to read:
        //
        //     p.setLoanDeduction(loanService.plannedDeduction(w.getId(), present));
        //
        // which is `dailyDeduction x presentDays`, capped at what is STILL
        // outstanding. In the ordinary case that happens to equal what daily
        // settlement took, because both are the same multiplication -- which is
        // exactly why it went unnoticed. It diverges whenever reality was not a
        // clean multiplication, and the worst case is silent:
        //
        //   * a loan CLEARED during the period reports 0, because nothing is
        //     left outstanding to forecast. A worker finishes paying off ৳1000
        //     and his payslip says ৳0 was deducted.
        //   * a day that earned less than the daily rate had its cut capped at
        //     the day's earnings; the forecast still assumes the full rate.
        //   * a loan approved mid-period is multiplied by every present day,
        //     including days before it existed.
        //   * days settlement has not reached yet are claimed as deducted.
        //
        // daily_settlement already records what actually moved, per day. The
        // payslip is a statement, so it must read that record.
        BigDecimal settledLoan = BigDecimal.ZERO;
        BigDecimal settledAdvance = BigDecimal.ZERO;
        for (var st : settlementRepository
                .findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(w.getId(), start, end)) {
            settledLoan = settledLoan.add(nz(st.getToLoan()));
            settledAdvance = settledAdvance.add(nz(st.getToAdvance()));
        }
        p.setLoanDeduction(settledLoan.setScale(2, RoundingMode.HALF_UP));

        // advanceRecovery is now derived too. It used to survive recompute so a
        // hand-typed value was not lost, but the value being preserved was
        // written by the retired monthly path and no regenerate could ever
        // clear it -- a stale ৳100 sat on a payslip permanently. otherDeduction
        // remains the one hand-editable field.
        p.setAdvanceRecovery(settledAdvance.setScale(2, RoundingMode.HALF_UP));

        recomputeNet(p);
    }

    private void recomputeNet(Payroll p) {
        BigDecimal ded = nz(p.getLoanDeduction())
                .add(nz(p.getAdvanceRecovery()))
                .add(nz(p.getOtherDeduction()));
        BigDecimal net = nz(p.getGrossAmount()).subtract(ded);
        // A payslip can be reduced to zero but never turned into a debt: if the
        // advances outrun the wages, the remainder stays owed on the loan rather
        // than becoming a negative payout the ledger would have to explain.
        p.setNetPayable(net.signum() < 0 ? BigDecimal.ZERO : net);
    }

    // ---- Helpers -----------------------------------------------------------

    private Payroll require(Long id) {
        return payrollRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payslip not found"));
    }

    private PayrollConfig currentConfig() {
        return configRepository.findTopByOrderByEffectiveFromDescIdDesc().orElseGet(this::defaultConfig);
    }

    private PayrollConfig defaultConfig() {
        // Builder defaults: 170 base, 23 kg quota, 5 surplus, 1 grade bonus, id null.
        return PayrollConfig.builder().build();
    }

    // If either bound is missing, default to the current calendar month.
    private LocalDate[] resolve(LocalDate start, LocalDate end) {
        if (start != null && end != null) {
            return new LocalDate[] { start, end };
        }
        LocalDate now = LocalDate.now();
        LocalDate first = now.withDayOfMonth(1);
        LocalDate last = now.withDayOfMonth(now.lengthOfMonth());
        return new LocalDate[] { first, last };
    }

    private PayrollStatus parseStatus(String s) {
        try {
            return PayrollStatus.valueOf(s.trim().toLowerCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown status: " + s);
        }
    }

    private Long userId(String username) {
        if (username == null) {
            return null;
        }
        return userRepository.findByUsername(username).map(User::getId).orElse(null);
    }

    // Deliberately findAll(), NOT live-only: this resolves worker names for
    // payslips that already exist. A retired worker's old payslip must still
    // show their name rather than "Worker #7".
    private Map<Long, Worker> workerMap() {
        Map<Long, Worker> m = new HashMap<>();
        workerRepository.findAll().forEach(w -> m.put(w.getId(), w));
        return m;
    }

    private Map<Long, String> zoneMap() {
        Map<Long, String> m = new HashMap<>();
        zoneRepository.findAll().forEach(z -> m.put(z.getId(), z.getName()));
        return m;
    }

    // What the register says RIGHT NOW for one worker, so a payslip can be
    // compared against it.
    //
    // Carries the SURPLUS and GRADE-A kilos, not just the total, because those
    // are what actually reach the wage. Total kilos alone would miss a regrade
    // -- 30 kg reclassified from A to B changes the bonus and nothing else --
    // and would flag a day split differently across two entries that isn't a
    // change at all.
    private record Register(int payableDays, BigDecimal leafKg,
                            BigDecimal surplusKg, BigDecimal gradeAKg) {}

    private PayrollResponse toResponse(Payroll p, Map<Long, Worker> workers, Map<Long, String> zones) {
        return toResponse(p, workers, zones, null);
    }

    private PayrollResponse toResponse(Payroll p, Map<Long, Worker> workers,
                                       Map<Long, String> zones,
                                       Map<Long, Register> register) {
        Worker w = (workers != null)
                ? workers.get(p.getWorkerId())
                : workerRepository.findById(p.getWorkerId()).orElse(null);
        String name = (w != null) ? w.getFullName() : "Worker #" + p.getWorkerId();
        String role = (w != null) ? w.getJobRole() : null;
        Long zoneId = (w != null) ? w.getZoneId() : null;
        String zoneName = null;
        if (zoneId != null) {
            zoneName = (zones != null)
                    ? zones.get(zoneId)
                    : zoneRepository.findById(zoneId).map(Zone::getName).orElse(null);
        }
        // Does the payslip still match the register?
        //
        // Only computed when a snapshot was supplied -- a single-row response
        // after an edit does not need it, and building one per row would make
        // the list N+1.
        boolean stale = false;
        String staleReason = null;
        Register reg = (register == null) ? null : register.get(p.getWorkerId());
        BigDecimal leafNow = (reg != null) ? reg.leafKg() : totalLeafKg(p);
        if (reg != null) {
            PayrollConfig cfg = currentConfig();
            int slipDays = p.getPresentDays() == null ? 0 : p.getPresentDays();

            // COMPARE THE MONEY, NOT THE KILOS.
            //
            // The payslip never stored the kilos it was built from, so there is
            // nothing to diff directly. What it did store is the surplus and
            // bonus those kilos produced -- so recompute both from the register
            // as it stands and see whether they still agree. That also makes
            // the test say something useful: a discrepancy here is a discrepancy
            // in what the worker is owed, not in a raw weight.
            BigDecimal surplusNow = nz(reg.surplusKg()).multiply(nz(cfg.getSurplusRate()))
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal bonusNow = nz(reg.gradeAKg()).multiply(nz(cfg.getGradeBonusRate()))
                    .setScale(2, RoundingMode.HALF_UP);

            boolean daysMoved = reg.payableDays() != slipDays;
            boolean payMoved = surplusNow.compareTo(nz(p.getSurplusAmount())) != 0
                            || bonusNow.compareTo(nz(p.getGradeBonus())) != 0;

            if (daysMoved && payMoved) {
                staleReason = "Attendance and leaf both changed since this was generated.";
            } else if (daysMoved) {
                staleReason = "Attendance changed: the register now shows "
                        + reg.payableDays() + (reg.payableDays() == 1 ? " day" : " days")
                        + ", this payslip was built on " + slipDays + ".";
            } else if (payMoved) {
                staleReason = "Leaf changed: surplus and bonus now come to ৳"
                        + surplusNow.add(bonusNow).toPlainString()
                        + ", this payslip has ৳"
                        + nz(p.getSurplusAmount()).add(nz(p.getGradeBonus())).toPlainString() + ".";
            }
            stale = staleReason != null;
        }

        return new PayrollResponse(
                p.getId(), p.getWorkerId(), name, role, zoneId, zoneName,
                p.getPeriodStart(), p.getPeriodEnd(), p.getPresentDays(), leafNow,
                p.getBaseAmount(), p.getSurplusAmount(), p.getGradeBonus(), p.getGrossAmount(),
                p.getLoanDeduction(), p.getAdvanceRecovery(), p.getOtherDeduction(), p.getNetPayable(),
                p.getStatus().name(), p.getPaidAt(), stale, staleReason);
    }

    // Total leaf plucked by this worker across the payslip period (kg), for the
    // admin Payroll "Weight (kg)" column. Demo-scale per-row query (mirrors the
    // existing per-row name/zone lookups).
    private BigDecimal totalLeafKg(Payroll p) {
        BigDecimal sum = BigDecimal.ZERO;
        for (LeafCollection lc : leafCollectionRepository
                .findByWorkerIdAndCollectDateBetween(p.getWorkerId(), p.getPeriodStart(), p.getPeriodEnd())) {
            sum = sum.add(nz(lc.getWeightKg()));
        }
        return sum.setScale(2, RoundingMode.HALF_UP);
    }

    private PayrollConfigResponse toConfigResponse(PayrollConfig c) {
        return new PayrollConfigResponse(
                c.getId(), c.getBaseDailyWage(), c.getLeafQuotaKg(),
                c.getSurplusRate(), c.getGradeBonusRate(),
                c.getAdvanceCap(), c.getLoanCap(), c.getLoanDailyDeduction(),
                c.getEffectiveFrom());
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static BigDecimal nz(BigDecimal b) {
        return b != null ? b : BigDecimal.ZERO;
    }
}
