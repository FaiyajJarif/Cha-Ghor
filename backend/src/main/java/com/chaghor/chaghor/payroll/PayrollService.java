package com.chaghor.chaghor.payroll;

import com.chaghor.chaghor.attendance.AttendanceRepository;
import com.chaghor.chaghor.audit.AuditService;
import com.chaghor.chaghor.attendance.AttendanceStatus;
import com.chaghor.chaghor.finance.FinanceService;
import com.chaghor.chaghor.leaf.LeafCollection;
import com.chaghor.chaghor.leaf.LeafCollectionRepository;
import com.chaghor.chaghor.leaf.LeafGrade;
import com.chaghor.chaghor.loan.LoanService;
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
import java.util.List;
import java.util.Map;
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
    private final FinanceService financeService;
    private final com.chaghor.chaghor.sms.SmsService smsService;
    // v10
    private final PendingRecoveryRepository pendingRecoveryRepository;
    private final LoanService loanService;
    private final com.chaghor.chaghor.audit.AuditService auditService;

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
        return rows.stream().map(p -> toResponse(p, workers, zones)).toList();
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
    public List<PayrollResponse> generate(LocalDate start, LocalDate end) {
        LocalDate[] period = resolve(start, end);
        PayrollConfig cfg = currentConfig();
        // Live workers only: a retired worker (deleted_at stamped) must never be
        // issued a NEW payslip. Their existing ones are untouched -- this is the
        // "who works here now" question, not "whose history is this".
        for (Worker w : workerRepository.findByDeletedAtIsNull()) {
            if (!"active".equalsIgnoreCase(w.getStatus())) {
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
            } else if (p.getStatus() != PayrollStatus.draft) {
                continue; // locked once it leaves Draft
            }
            recompute(p, w, cfg, period[0], period[1]);
            payrollRepository.save(p);
            // v10: the row now has an id, so any advance this worker took while
            // there was no editable payslip can finally be absorbed.
            drainPendingRecovery(p);
        }
        return list(period[0], period[1], null);
    }

    // ---- Deductions --------------------------------------------------------

    @Transactional
    public PayrollResponse updateDeductions(Long id, DeductionRequest req) {
        Payroll p = require(id);
        if (p.getStatus() != PayrollStatus.draft && p.getStatus() != PayrollStatus.review) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Deductions can only be edited while a payslip is in Draft or Review.");
        }
        if (req.loanDeduction() != null) {
            p.setLoanDeduction(req.loanDeduction());
        }
        if (req.advanceRecovery() != null) {
            p.setAdvanceRecovery(req.advanceRecovery());
        }
        if (req.otherDeduction() != null) {
            p.setOtherDeduction(req.otherDeduction());
        }
        recomputeNet(p);
        payrollRepository.save(p);
        return toResponse(p, null, null);
    }

    // Called when a worker's withdrawal (an advance against wages) is PAID.
    // Adds the amount to advance_recovery on that worker's CURRENT-PERIOD
    // payslip, so money they have already taken is netted off what they are
    // still owed. Without this the same taka leaves twice: once over bKash and
    // again in the payslip.
    //
    // v10: this can no longer fail quietly. If there is no payslip for the
    // period yet, or it has already been Approved/Paid and is therefore locked,
    // the recovery is PARKED in payroll_pending_recovery and absorbed by the
    // next generated payslip for that worker. Returns true when it was applied
    // immediately, false when it was parked -- either way the money is tracked.
    @Transactional
    public boolean recoverAdvance(Long workerId, BigDecimal amount,
                                  String sourceType, Long sourceId, String note) {
        if (workerId == null || amount == null || amount.signum() <= 0) {
            return false;
        }
        LocalDate[] period = resolve(null, null);
        Payroll p = payrollRepository
                .findByWorkerIdAndPeriodStartAndPeriodEnd(workerId, period[0], period[1])
                .orElse(null);

        boolean editable = p != null
                && (p.getStatus() == PayrollStatus.draft || p.getStatus() == PayrollStatus.review);

        if (editable) {
            p.setAdvanceRecovery(nz(p.getAdvanceRecovery()).add(amount));
            recomputeNet(p);
            payrollRepository.save(p);
            // Record it as already-settled so the money has an audit trail even
            // when it never had to wait in the queue.
            pendingRecoveryRepository.save(PendingRecovery.builder()
                    .workerId(workerId)
                    .amount(amount)
                    .sourceType(sourceType)
                    .sourceId(sourceId)
                    .note(note)
                    .appliedAt(OffsetDateTime.now())
                    .payrollId(p.getId())
                    .build());
            return true;
        }

        pendingRecoveryRepository.save(PendingRecovery.builder()
                .workerId(workerId)
                .amount(amount)
                .sourceType(sourceType)
                .sourceId(sourceId)
                .note(note)
                .build());
        return false;
    }

    // Back-compat overload for any caller that does not carry source details.
    @Transactional
    public boolean applyAdvanceRecovery(Long workerId, BigDecimal amount) {
        return recoverAdvance(workerId, amount, "advance", null, null);
    }

    // Absorb every open pending recovery for this payslip's worker. Each row is
    // stamped applied so it can never be counted twice, which is what makes
    // re-running generate() safe.
    private void drainPendingRecovery(Payroll p) {
        if (p.getId() == null) {
            return;
        }
        if (p.getStatus() != PayrollStatus.draft && p.getStatus() != PayrollStatus.review) {
            return;
        }
        List<PendingRecovery> open =
                pendingRecoveryRepository.findByWorkerIdAndAppliedAtIsNullOrderByIdAsc(p.getWorkerId());
        if (open.isEmpty()) {
            return;
        }
        BigDecimal added = BigDecimal.ZERO;
        OffsetDateTime now = OffsetDateTime.now();
        for (PendingRecovery r : open) {
            added = added.add(nz(r.getAmount()));
            r.setAppliedAt(now);
            r.setPayrollId(p.getId());
        }
        pendingRecoveryRepository.saveAll(open);
        p.setAdvanceRecovery(nz(p.getAdvanceRecovery()).add(added));
        recomputeNet(p);
        payrollRepository.save(p);
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
        // Auto-post the wage payment into the Finance ledger so it shows up as
        // real PAYROLL spend. Idempotent, and runs in the same transaction as
        // the state change so both commit (or roll back) together.
        Payroll p = require(id);
        String account = workerRepository.findById(p.getWorkerId())
                .map(Worker::getFullName)
                .orElse("Worker #" + p.getWorkerId());
        LocalDate paidDate = p.getPaidAt() != null ? p.getPaidAt().toLocalDate() : LocalDate.now();
        // Only the NET actually leaves the estate -- the deductions stay behind.
        financeService.postPayroll(p.getId(), account, p.getNetPayable(), paidDate);

        // v10: the loan deduction withheld from these wages is money the worker
        // has genuinely repaid, so settle it against their outstanding loans now.
        // This is what finally moves loan.repaid and posts the capital back into
        // the ledger as loan_in. Guarded against double-recovery per payslip.
        loanService.recoverFromPayslip(p.getWorkerId(), p.getLoanDeduction(), paidDate, p.getId());

        // Phase 3: (mock) SMS to the worker that their pay has landed. Best-effort,
        // runs in its own transaction so it never affects the payroll/finance commit.
        smsService.notifyPayrollPaid(p.getWorkerId(), p.getNetPayable());

        // Paying is the single most consequential action in the system: cash
        // leaves, loans are settled, an SMS goes out. Record who did it.
        auditService.recordTransition("payroll", id, "approved", "paid",
                AuditService.details("netPayable", nz(p.getNetPayable()),
                        "loanDeduction", nz(p.getLoanDeduction()),
                        "workerId", p.getWorkerId(),
                        "paidOn", paidDate.toString()));
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
                "gradeBonusRate", nz(c.getGradeBonusRate()));
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
        p.setLoanDeduction(loanService.plannedDeduction(w.getId(), (int) present));

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

    private PayrollResponse toResponse(Payroll p, Map<Long, Worker> workers, Map<Long, String> zones) {
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
        return new PayrollResponse(
                p.getId(), p.getWorkerId(), name, role, zoneId, zoneName,
                p.getPeriodStart(), p.getPeriodEnd(), p.getPresentDays(), totalLeafKg(p),
                p.getBaseAmount(), p.getSurplusAmount(), p.getGradeBonus(), p.getGrossAmount(),
                p.getLoanDeduction(), p.getAdvanceRecovery(), p.getOtherDeduction(), p.getNetPayable(),
                p.getStatus().name(), p.getPaidAt());
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
                c.getSurplusRate(), c.getGradeBonusRate(), c.getEffectiveFrom());
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static BigDecimal nz(BigDecimal b) {
        return b != null ? b : BigDecimal.ZERO;
    }
}
