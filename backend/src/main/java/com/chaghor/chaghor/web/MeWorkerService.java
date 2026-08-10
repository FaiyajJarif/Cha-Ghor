package com.chaghor.chaghor.web;

import com.chaghor.chaghor.leaf.LeafCollection;
import com.chaghor.chaghor.leaf.LeafCollectionRepository;
import com.chaghor.chaghor.leaf.LeafGrade;
import com.chaghor.chaghor.loan.Loan;
import com.chaghor.chaghor.loan.LoanRepository;
import com.chaghor.chaghor.loan.LoanStatus;
import com.chaghor.chaghor.payroll.Payroll;
import com.chaghor.chaghor.payroll.PayrollRepository;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.web.dto.MyWages;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Everything a worker may read about themselves, and nothing else.
//
// THE ONE RULE THIS CLASS EXISTS TO ENFORCE
//   Every method resolves the worker from the SecurityContext. Not one of them
//   takes a worker id, and none ever should.
//
//   Every other tier in this system is ADMIN or SUPERVISOR, where handing back
//   whatever id was asked for is correct -- an admin is entitled to any worker's
//   payroll. This is the first tier where that is a data breach: a worker who
//   edits a number in a URL would be reading a colleague's wages, their loans
//   and their grievances. So the id never crosses the wire, and there is no
//   parameter for an attacker to change.
//
//   If a method here ever needs a `Long workerId` argument, something has gone
//   wrong upstream. Fix it there.
@Service
@RequiredArgsConstructor
public class MeWorkerService {

    private static final int HISTORY_MONTHS = 12;

    private final WorkerRepository workerRepository;
    private final UserRepository userRepository;
    private final PayrollRepository payrollRepository;
    private final LeafCollectionRepository leafRepository;
    private final LoanRepository loanRepository;
    private final com.chaghor.chaghor.attendance.AttendanceRepository attendanceRepository;
    private final com.chaghor.chaghor.zone.ZoneRepository zoneRepository;
    private final com.chaghor.chaghor.payroll.PayrollConfigRepository payrollConfigRepository;

    // ---- the resolution step ------------------------------------------------

    // Signed-in user -> their own worker row.
    //
    // `workers.user_id` has existed since V1 and was never read by anything.
    // It is nullable, so an account that was created without being linked is a
    // real and ordinary state -- and it gets a sentence someone can act on
    // rather than an empty object that renders as a page full of zeros.
    @Transactional(readOnly = true)
    public Worker me() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please sign in again.");
        }
        Long userId = userRepository.findByUsername(auth.getName())
                .map(u -> u.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Please sign in again."));

        return workerRepository.findFirstByUserIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "This account is not linked to a worker record yet. "
                                + "Ask the office to connect it."));
    }

    // ---- profile ------------------------------------------------------------

    @Transactional(readOnly = true)
    public Map<String, Object> profile() {
        Worker w = me();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("workerId", w.getId());
        m.put("code", "CG-" + w.getId());
        m.put("fullName", w.getFullName());
        m.put("nameBn", w.getNameBn());
        m.put("photoUrl", w.getPhotoUrl());
        m.put("gender", w.getGender());        // null until the office records it (V31)
        m.put("dob", w.getDob());
        m.put("joinDate", w.getJoinDate());
        m.put("jobRole", w.getJobRole());
        m.put("phone", w.getPhone());
        m.put("dailyWage", nz(w.getDailyWage()));
        m.put("status", w.getStatus());
        m.put("zoneName", zoneName(w.getZoneId()));
        m.put("supervisorName", supervisorName(w.getSupervisorId()));
        return m;
    }

    // ---- today --------------------------------------------------------------

    // What the worker did today, from the registers.
    //
    // REPLACES the mockup's check-in / shift-end panel, which cannot be served:
    // attendance stores `status`, `lateMinutes` and `markedAt` -- there is no
    // clock-in. `markedAt` is when the SUPERVISOR marked the register, which is
    // a different thing and must never be labelled as the worker's arrival.
    @Transactional(readOnly = true)
    public Map<String, Object> today() {
        Worker w = me();
        LocalDate d = LocalDate.now();

        Map<String, Object> att = new LinkedHashMap<>();
        var row = attendanceRepository.findByWorkerIdAndWorkDate(w.getId(), d);
        att.put("marked", row.isPresent());
        att.put("status", row.map(a -> a.getStatus() == null ? null : a.getStatus().name()).orElse(null));
        att.put("lateMinutes", row.map(a -> a.getLateMinutes()).orElse(null));

        BigDecimal kg = BigDecimal.ZERO;
        for (LeafCollection lc : leafRepository.findByWorkerIdAndCollectDateBetween(w.getId(), d, d)) {
            kg = kg.add(nz(lc.getWeightKg()));
        }

        // The quota is runtime-configurable. Reading it rather than hardcoding
        // means the worker's progress bar and the wage engine can never disagree
        // about what "the target" is.
        BigDecimal quota = payrollConfigRepository.findAll().stream()
                .findFirst()
                .map(c -> nz(c.getLeafQuotaKg()))
                .filter(q -> q.signum() > 0)
                .orElse(new BigDecimal("23"));

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("date", d.toString());
        m.put("attendance", att);
        m.put("leafKgToday", kg);
        m.put("quotaKg", quota);
        m.put("quotaPct", quota.signum() == 0 ? 0
                : kg.multiply(BigDecimal.valueOf(100))
                    .divide(quota, 0, java.math.RoundingMode.HALF_UP).intValue());
        m.put("zoneName", zoneName(w.getZoneId()));
        m.put("supervisorName", supervisorName(w.getSupervisorId()));
        return m;
    }

    private String zoneName(Long zoneId) {
        if (zoneId == null) return null;
        return zoneRepository.findById(zoneId).map(z -> z.getName()).orElse(null);
    }

    private String supervisorName(Long supervisorId) {
        if (supervisorId == null) return null;
        return userRepository.findById(supervisorId)
                .map(u -> (u.getDisplayName() == null || u.getDisplayName().isBlank())
                        ? u.getUsername() : u.getDisplayName())
                .orElse(null);
    }

    // ---- wages --------------------------------------------------------------

    @Transactional(readOnly = true)
    public MyWages wages() {
        Worker w = me();
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusMonths(HISTORY_MONTHS).withDayOfMonth(1);

        // Every payslip is fetched and then filtered to this worker in memory.
        // Not elegant, but PayrollRepository has no findByWorkerId and adding
        // one is a change to a module that handles money -- out of scope for a
        // read-only screen. Revisit if an estate's history makes it slow.
        List<Payroll> mine = payrollRepository.findAll().stream()
                .filter(p -> w.getId().equals(p.getWorkerId()))
                .filter(p -> p.getPeriodEnd() != null && !p.getPeriodEnd().isBefore(from))
                .sorted(Comparator.comparing(Payroll::getPeriodStart).reversed())
                .toList();

        // Leaf totals per period, so the worker can see what the pay was
        // computed from rather than being asked to trust it.
        Map<Long, BigDecimal> kgByPayroll = new LinkedHashMap<>();
        Map<Long, BigDecimal> gradeAByPayroll = new LinkedHashMap<>();
        for (Payroll p : mine) {
            BigDecimal kg = BigDecimal.ZERO;
            BigDecimal aKg = BigDecimal.ZERO;
            for (LeafCollection lc : leafRepository.findByWorkerIdAndCollectDateBetween(
                    w.getId(), p.getPeriodStart(), p.getPeriodEnd())) {
                BigDecimal x = nz(lc.getWeightKg());
                kg = kg.add(x);
                if (lc.getQualityGrade() == LeafGrade.A) aKg = aKg.add(x);
            }
            kgByPayroll.put(p.getId(), kg);
            gradeAByPayroll.put(p.getId(), aKg);
        }

        MyWages.Period current = null;
        List<MyWages.Period> history = new ArrayList<>();
        for (Payroll p : mine) {
            MyWages.Period row = toPeriod(p, kgByPayroll.get(p.getId()), gradeAByPayroll.get(p.getId()));
            // "Current" is the period today falls inside, not simply the newest
            // row -- an estate that has not generated this month's drafts yet
            // should show no current period rather than last month's dressed up
            // as this one.
            boolean isCurrent = p.getPeriodStart() != null && p.getPeriodEnd() != null
                    && !today.isBefore(p.getPeriodStart()) && !today.isAfter(p.getPeriodEnd());
            if (isCurrent && current == null) current = row;
            else history.add(row);
        }
        return new MyWages(current, history);
    }

    private MyWages.Period toPeriod(Payroll p, BigDecimal kg, BigDecimal gradeAKg) {
        String status = p.getStatus() == null ? "draft" : p.getStatus().name();
        // Anything not yet approved can still move. Saying so is the difference
        // between informing a worker and misleading one.
        boolean provisional = !"paid".equals(status) && !"approved".equals(status);
        return new MyWages.Period(
                p.getPeriodStart(), p.getPeriodEnd(), status, provisional,
                p.getPresentDays() == null ? 0 : p.getPresentDays(),
                nz(kg), nz(gradeAKg),
                nz(p.getBaseAmount()), nz(p.getSurplusAmount()), nz(p.getGradeBonus()),
                nz(p.getGrossAmount()),
                nz(p.getLoanDeduction()), nz(p.getAdvanceRecovery()), nz(p.getOtherDeduction()),
                nz(p.getNetPayable()),
                p.getPaidAt() == null ? null : p.getPaidAt().toLocalDate().toString());
    }

    // ---- loans --------------------------------------------------------------

    @Transactional(readOnly = true)
    public Map<String, Object> loans() {
        Worker w = me();
        List<Map<String, Object>> out = new ArrayList<>();
        BigDecimal totalOutstanding = BigDecimal.ZERO;

        // ACTIVE and OVERDUE are the two states with money still owed.
        // PENDING has not been disbursed, REPAID is closed, REJECTED never
        // happened -- showing any of those as an outstanding balance would
        // misstate what a worker owes.
        for (Loan l : loanRepository.findByWorkerIdAndStatusInOrderByIdAsc(
                w.getId(), List.of(LoanStatus.ACTIVE, LoanStatus.OVERDUE))) {
            BigDecimal outstanding = nz(l.getPrincipal()).subtract(nz(l.getRepaid()));
            if (outstanding.signum() < 0) outstanding = BigDecimal.ZERO;
            totalOutstanding = totalOutstanding.add(outstanding);

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ref", l.getReference());
            m.put("principal", nz(l.getPrincipal()));
            m.put("repaid", nz(l.getRepaid()));
            m.put("outstanding", outstanding);
            m.put("dailyDeduction", nz(l.getDailyDeduction()));
            m.put("status", l.getStatus() == null ? null : l.getStatus().name());
            out.add(m);
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("loans", out);
        res.put("totalOutstanding", totalOutstanding);
        return res;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
