package com.chaghor.chaghor.web;

import com.chaghor.chaghor.fieldcase.FieldCase;
import com.chaghor.chaghor.fieldcase.FieldCaseRepository;
import com.chaghor.chaghor.fieldcase.CaseStatus;
import com.chaghor.chaghor.fieldcase.CasePriority;
import com.chaghor.chaghor.fieldcase.CaseType;
import com.chaghor.chaghor.leaf.LeafCollection;
import com.chaghor.chaghor.leaf.LeafCollectionRepository;
import com.chaghor.chaghor.leaf.LeafGrade;
import com.chaghor.chaghor.loan.Loan;
import com.chaghor.chaghor.loan.LoanRepository;
import com.chaghor.chaghor.loan.LoanStatus;
import com.chaghor.chaghor.payroll.Payroll;
import com.chaghor.chaghor.payroll.PayrollRepository;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.attendance.AttendanceStatus;
import com.chaghor.chaghor.web.dto.LoanAffordability;
import com.chaghor.chaghor.web.dto.MyWages;
import com.chaghor.chaghor.web.dto.PayChange;
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
    private final DailyLedgerService dailyLedger;
    private final com.chaghor.chaghor.zone.ZoneRepository zoneRepository;
    private final com.chaghor.chaghor.payroll.PayrollConfigRepository payrollConfigRepository;
    private final com.chaghor.chaghor.withdrawal.WithdrawalRepository withdrawalRepository;
    private final FieldCaseRepository caseRepository;
    private final com.chaghor.chaghor.fieldcase.CaseReplyRepository caseReplyRepository;
    private final com.chaghor.chaghor.fieldcase.CaseAttachmentService attachments;

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

    // ---- why did my pay change? --------------------------------------------

    // Reconcile this period against the previous one, line by line.
    //
    // THE ARITHMETIC IS TRIVIAL AND THAT IS THE POINT. Each component is simply
    // (this month's line) − (last month's line), with deductions negated so a
    // bigger deduction reads as a negative effect on take-home. Because the net
    // is gross minus the three deductions, those six differences necessarily
    // sum to the net difference — and `reconciles` proves it rather than
    // assuming it.
    //
    // A worker can check every line of this against the payslip printed above
    // it. That is what makes it worth showing at all.
    @Transactional(readOnly = true)
    public PayChange payChange() {
        MyWages w = wages();
        MyWages.Period cur = w.current();
        // Fall back to the newest closed period when this month has no payslip
        // yet — "why is last month different from the one before" is still a
        // question worth answering.
        List<MyWages.Period> hist = w.history();
        if (cur == null && !hist.isEmpty()) {
            cur = hist.get(0);
            hist = hist.subList(1, hist.size());
        }

        if (cur == null) {
            return new PayChange(false, "এখনো কোনো বেতনের হিসাব তৈরি হয়নি।",
                    null, null, null, null, null, List.of(), false);
        }
        if (hist.isEmpty()) {
            return new PayChange(false,
                    "এটিই আপনার প্রথম মাসের হিসাব, তাই তুলনা করার মতো আগের মাস নেই।",
                    label(cur), null, cur.netPayable(), null, null, List.of(), false);
        }
        MyWages.Period prev = hist.get(0);

        List<PayChange.Component> parts = new ArrayList<>();
        // Earnings: a rise is a positive effect.
        addPart(parts, "base", cur.base().subtract(prev.base()),
                prev.presentDays() + " দিন", cur.presentDays() + " দিন");
        addPart(parts, "surplus", cur.surplus().subtract(prev.surplus()),
                fmtKg(prev.leafKg()), fmtKg(cur.leafKg()));
        addPart(parts, "gradeBonus", cur.gradeBonus().subtract(prev.gradeBonus()),
                fmtKg(prev.gradeAKg()), fmtKg(cur.gradeAKg()));
        // Deductions: NEGATED, because a larger deduction is a smaller wage.
        // Getting this sign wrong would produce an explanation that reads
        // backwards while still summing correctly.
        addPart(parts, "loanDeduction", prev.loanDeduction().subtract(cur.loanDeduction()),
                fmtTk(prev.loanDeduction()), fmtTk(cur.loanDeduction()));
        addPart(parts, "advanceRecovery", prev.advanceRecovery().subtract(cur.advanceRecovery()),
                fmtTk(prev.advanceRecovery()), fmtTk(cur.advanceRecovery()));
        addPart(parts, "otherDeduction", prev.otherDeduction().subtract(cur.otherDeduction()),
                fmtTk(prev.otherDeduction()), fmtTk(cur.otherDeduction()));

        // THE FLOOR, AND WHY IT NEEDS ITS OWN LINE.
        //
        // Net floors at zero: when deductions exceed the wage, the estate does
        // not take the remainder, and the money model says it "stays owed on
        // the loan". That means net is NOT simply gross minus deductions --
        // it is gross minus deductions PLUS whatever could not be taken.
        //
        // Leave that out and the six lines above sum to more than the real
        // difference. Tested: a month where a ৳4,000 deduction met a ৳1,700
        // wage produced an explanation claiming ৳6,090 of change against an
        // actual ৳3,790 -- over-stating the fall by ৳2,300, in exactly the
        // month a worker most needs the truth.
        //
        // So the shortfall is a component in its own right, and an honest one:
        // it is money that was owed, was not deducted, and is still owed.
        BigDecimal shortNow = shortfall(cur);
        BigDecimal shortPrev = shortfall(prev);
        addPart(parts, "unrecovered", shortNow.subtract(shortPrev),
                fmtTk(shortPrev), fmtTk(shortNow));

        // Biggest effect first — a worker wants the reason, not a ledger.
        parts.sort(Comparator.comparing((PayChange.Component c) -> c.amount().abs()).reversed());

        BigDecimal diff = cur.netPayable().subtract(prev.netPayable());
        BigDecimal summed = parts.stream()
                .map(PayChange.Component::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Checked, not assumed. The net floors at zero, so a month where wages
        // could not cover the deductions will NOT reconcile -- and the UI hides
        // the panel rather than showing an explanation that does not add up.
        boolean reconciles = summed.compareTo(diff) == 0;

        return new PayChange(true, null, label(cur), label(prev),
                cur.netPayable(), prev.netPayable(), diff, parts, reconciles);
    }

    private void addPart(List<PayChange.Component> out, String key, BigDecimal amount,
                         String from, String to) {
        // Unchanged lines are left out. Listing six components of which four are
        // zero buries the one that matters.
        if (amount == null || amount.signum() == 0) return;
        out.add(new PayChange.Component(key, amount, from, to));
    }

    private static String label(MyWages.Period p) {
        return p.periodStart() == null ? "" : p.periodStart().toString();
    }

    private static String fmtKg(BigDecimal v) {
        return nz(v).setScale(1, java.math.RoundingMode.HALF_UP).toPlainString() + " কেজি";
    }

    private static String fmtTk(BigDecimal v) {
        return "৳" + nz(v).setScale(0, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    // How much of this period's deductions could NOT be taken because the wage
    // did not cover them. Zero in an ordinary month.
    private static BigDecimal shortfall(MyWages.Period p) {
        BigDecimal deductions = nz(p.loanDeduction())
                .add(nz(p.advanceRecovery()))
                .add(nz(p.otherDeduction()));
        BigDecimal over = deductions.subtract(nz(p.gross()));
        return over.signum() > 0 ? over : BigDecimal.ZERO;
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

    // ---- this month ---------------------------------------------------------

    // The worker's own month: days worked, kilos picked, their best day, and
    // the last time they were actually paid.
    //
    // THIS REPLACED THE MOCKUP'S COMPLIANCE CARD -- PPE 95%, safety score 9.8,
    // "450 accident-free days" -- none of which exists anywhere in the schema.
    // Every figure here comes from the same two registers the payslip is built
    // from, so a worker can compare this against their pay and have it agree.
    @Transactional(readOnly = true)
    public Map<String, Object> myMonth() {
        Worker w = me();
        LocalDate today = LocalDate.now();
        LocalDate from = today.withDayOfMonth(1);

        int present = 0;
        int late = 0;
        for (var a : attendanceRepository
                .findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(w.getId(), from, today)) {
            if (a.getStatus() == AttendanceStatus.present) present++;
            else if (a.getStatus() == AttendanceStatus.late) late++;
        }

        BigDecimal totalKg = BigDecimal.ZERO;
        BigDecimal bestKg = BigDecimal.ZERO;
        LocalDate bestDay = null;
        Map<LocalDate, BigDecimal> byDay = new LinkedHashMap<>();
        for (LeafCollection lc : leafRepository
                .findByWorkerIdAndCollectDateBetween(w.getId(), from, today)) {
            if (lc.getCollectDate() == null) continue;
            byDay.merge(lc.getCollectDate(), nz(lc.getWeightKg()), BigDecimal::add);
        }
        for (var e : byDay.entrySet()) {
            totalKg = totalKg.add(e.getValue());
            if (e.getValue().compareTo(bestKg) > 0) {
                bestKg = e.getValue();
                bestDay = e.getKey();
            }
        }

        // Average per DAY PICKED, not per calendar day -- dividing by the month
        // would make anyone who worked three weeks look lazy.
        BigDecimal avgKg = byDay.isEmpty() ? BigDecimal.ZERO
                : totalKg.divide(BigDecimal.valueOf(byDay.size()), 1, java.math.RoundingMode.HALF_UP);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("presentDays", present);
        m.put("lateDays", late);
        m.put("workedDays", present + late);   // late still pays a full day
        m.put("totalKg", totalKg.setScale(1, java.math.RoundingMode.HALF_UP));
        m.put("avgKgPerPickingDay", avgKg);
        m.put("bestKg", bestKg.signum() > 0 ? bestKg.setScale(1, java.math.RoundingMode.HALF_UP) : null);
        m.put("bestDay", bestDay);

        // The last payslip actually PAID. Not the newest row -- a draft is not
        // a payment, and showing one here would be the same mistake as calling
        // a draft figure a balance.
        Payroll lastPaid = payrollRepository.findAll().stream()
                .filter(p -> w.getId().equals(p.getWorkerId()))
                .filter(p -> p.getStatus() == com.chaghor.chaghor.payroll.PayrollStatus.paid)
                .max(Comparator.comparing(Payroll::getPaidAt,
                        Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
        if (lastPaid != null) {
            Map<String, Object> pay = new LinkedHashMap<>();
            pay.put("amount", nz(lastPaid.getNetPayable()));
            pay.put("paidAt", lastPaid.getPaidAt());
            pay.put("periodStart", lastPaid.getPeriodStart());
            pay.put("periodEnd", lastPaid.getPeriodEnd());
            m.put("lastPayment", pay);
        } else {
            m.put("lastPayment", null);
        }
        return m;
    }

    // ---- profile photo ------------------------------------------------------

    // The worker sets their own photo.
    //
    // There was no upload anywhere in this system. `workers.photo_url` has
    // existed since V1, the admin Workforce form has a photo control -- and it
    // is a LOCAL PREVIEW ONLY, with a comment saying the upload "lands with"
    // work that never happened. So every avatar in the product fell back to an
    // initial, and nothing could ever change that.
    //
    // REUSES CaseAttachmentService rather than adding a second uploader. That
    // class already refuses anything that is not a real PNG/JPEG/WEBP by magic
    // bytes, stores under a UUID it generates so the user's filename never
    // touches the disk, and caps at 10MB. A second implementation would be a
    // second place to get those wrong.
    @Transactional
    public Map<String, Object> setPhoto(org.springframework.web.multipart.MultipartFile file) {
        Worker w = me();

        String declared = file == null || file.getContentType() == null
                ? "" : file.getContentType().toLowerCase();
        // Images only. The attachment store also accepts PDF and audio, which
        // are perfectly valid there and meaningless as a profile picture.
        if (!declared.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "ছবি হিসেবে শুধু ছবি ফাইল দেওয়া যাবে।");
        }

        String stored = attachments.store(file);
        String url = "/api/v1/complaints/attachments/" + stored;
        w.setPhotoUrl(url);
        workerRepository.save(w);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("photoUrl", url);
        return m;
    }

    // ---- daily ledger -------------------------------------------------------

    // The current payroll period, day by day. Period boundaries come from the
    // same month the payslip uses, so the two can be compared line for line.
    @Transactional(readOnly = true)
    public Map<String, Object> daily() {
        Worker w = me();
        LocalDate today = LocalDate.now();
        return dailyLedger.ledger(w, today.withDayOfMonth(1), today);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> limits() {
        Worker w = me();
        LocalDate today = LocalDate.now();
        return dailyLedger.limits(w, today.withDayOfMonth(1), today);
    }

    // ---- notices ------------------------------------------------------------

    // What the estate has told everyone: weather alerts, shift changes, field
    // notices raised by a supervisor.
    //
    // THE FILTER IS THE FEATURE. A worker sees caseType == REPORT and NOTHING
    // else. COMPLAINT cases are other people's grievances -- often about their
    // supervisor, sometimes confidential -- and one of those appearing on a
    // worker's home screen would end the grievance channel permanently.
    //
    // Until this existed a supervisor could broadcast "heavy rain tomorrow,
    // start early" and a worker opening the app saw nothing at all. The SMS
    // reaches their phone, but only when a gateway is configured and only for
    // that one message.
    @Transactional(readOnly = true)
    public List<Map<String, Object>> notices() {
        // Resolve the worker first: this endpoint is only for people who have a
        // worker record, and it keeps the 404 consistent with the rest.
        Worker w = me();

        return caseRepository.findAll().stream()
                .filter(c -> c.getCaseType() == CaseType.REPORT)
                // A resolved notice is history. "No work today" from three
                // weeks ago on a worker's home screen is worse than nothing.
                .filter(c -> c.getStatus() != CaseStatus.RESOLVED
                        && c.getStatus() != CaseStatus.REJECTED)
                .sorted(Comparator.comparing(
                        FieldCase::getCreatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(20)
                .map(c -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", c.getId());
                    m.put("title", c.getTitle());
                    m.put("body", c.getBody());
                    m.put("category", c.getCategory());
                    m.put("priority", c.getPriority() == null ? null : c.getPriority().name());
                    m.put("zone", c.getZone());
                    // Who announced it -- useful context, and a broadcast is not
                    // confidential by nature. Suppressed anyway if the flag is
                    // somehow set, so this can never become a leak.
                    m.put("from", c.isConfidential() ? null : c.getSubmitterName());
                    m.put("createdAt", c.getCreatedAt());
                    // Whether it names the worker's own field, so the UI can
                    // put "your field" notices first.
                    m.put("mine", c.getZone() != null
                            && c.getZone().equalsIgnoreCase(zoneName(w.getZoneId())));
                    return m;
                })
                .toList();
    }

    // ---- complaints ---------------------------------------------------------

    // The worker's own cases, plus the four counts the board shows.
    //
    // Counts are computed from the SAME rows that are returned, so the cards
    // can never disagree with the table beneath them -- a small thing that
    // quietly destroys trust when it goes wrong.
    @Transactional(readOnly = true)
    public Map<String, Object> myCases() {
        Worker w = me();
        Long userId = w.getUserId();

        // Indexed lookup, not a full scan and filter — this runs on every load
        // of the worker's own board.
        List<FieldCase> mine = (userId == null) ? List.of()
                : caseRepository.findBySubmittedByOrderByCreatedAtDesc(userId);

        List<Map<String, Object>> rows = new ArrayList<>();
        int resolved = 0, investigating = 0, urgent = 0;
        for (FieldCase c : mine) {
            if (c.getStatus() == CaseStatus.RESOLVED) resolved++;
            if (c.getStatus() == CaseStatus.IN_PROGRESS) investigating++;
            if (c.getPriority() == CasePriority.URGENT) urgent++;

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("category", c.getCategory());
            m.put("title", c.getTitle());
            m.put("body", c.getBody());
            m.put("priority", c.getPriority() == null ? null : c.getPriority().name());
            m.put("status", c.getStatus() == null ? null : c.getStatus().name());
            m.put("confidential", c.isConfidential());
            m.put("incidentDate", c.getIncidentDate());
            m.put("createdAt", c.getCreatedAt());
            m.put("resolvedAt", c.getResolvedAt());
            // THE OFFICE'S ACTUAL WORDS.
            //
            // This used to be `replied: true` and nothing else -- the worker was
            // told an answer existed and never shown one. A boolean is not a
            // reply; it is the shape of a reply with the content removed, and it
            // is arguably worse than silence because it looks like the channel
            // worked.
            //
            // Safe to return in full: these are replies on a case THIS worker
            // submitted, reached through findBySubmittedBy above. The
            // confidentiality rules in CaseListItemResponse protect a submitter
            // from other readers -- they were never about hiding the office's
            // answer from the person who asked the question.
            List<Map<String, Object>> replies = new ArrayList<>();
            for (var r : caseReplyRepository.findByCaseIdOrderByCreatedAtAsc(c.getId())) {
                Map<String, Object> rm = new LinkedHashMap<>();
                rm.put("id", r.getId());
                rm.put("body", r.getBody());
                // The role, not the person: "office" is what a worker needs to
                // know, and naming the individual admin invites a grievance
                // about a reply to become a grievance about a colleague.
                rm.put("authorRole", r.getAuthorRole());
                rm.put("createdAt", r.getCreatedAt());
                replies.add(rm);
            }
            m.put("replies", replies);
            m.put("replied", !replies.isEmpty() || c.getFirstResponseAt() != null);
            rows.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cases", rows);
        out.put("total", rows.size());
        out.put("resolved", resolved);
        out.put("investigating", investigating);
        out.put("urgent", urgent);
        return out;
    }

    // A stored attachment name is a UUID plus an extension WE chose -- see
    // CaseAttachmentService. Anything else is refused before it reaches the row.
    //
    // KEEP CONSTANTS OUT OF THE GAP BETWEEN AN ANNOTATION AND ITS METHOD. This
    // field was first written directly under fileCase's @Transactional, which
    // made the annotation apply to the field instead. That is one real error --
    // "annotation type not applicable to this kind of declaration" -- followed
    // by ~99 cascading "cannot find symbol" messages, because javac abandons
    // the class and every entity getter then resolves to Object. See CLAUDE.md
    // section 8: read the FIRST error.
    private static final java.util.regex.Pattern EVIDENCE_URL =
            java.util.regex.Pattern.compile(
                    "^/api/v1/complaints/attachments/"
                            + "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
                            + "\\.(png|jpg|webp|pdf|weba|m4a|oga)$");

    // File a complaint as this worker.
    //
    // The zone comes from their own record rather than a picker: a worker
    // reporting a problem in a field they do not work is not a case this needs
    // to handle, and a free zone field is one more thing to validate.
    @Transactional
    public Map<String, Object> fileCase(String category, String title, String body,
                                        String priority, java.time.LocalDate incidentDate,
                                        boolean confidential, java.util.UUID clientUuid,
                                        String evidenceUrl) {
        Worker w = me();

        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "অভিযোগের একটি শিরোনাম লিখুন।");
        }
        if (body == null || body.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "কী হয়েছে সেটি লিখুন।");
        }

        // A complaint written in a dead spot and replayed must not become two
        // complaints. Two copies of the same grievance is exactly the noise
        // that makes a channel look unreliable.
        if (clientUuid != null) {
            var existing = caseRepository.findFirstByClientUuid(clientUuid);
            if (existing.isPresent()) {
                Map<String, Object> dup = new LinkedHashMap<>();
                dup.put("id", existing.get().getId());
                dup.put("status", existing.get().getStatus().name());
                dup.put("duplicate", true);
                return dup;
            }
        }

        if (evidenceUrl != null && !evidenceUrl.isBlank()) {
            // A VOICE IS AN IDENTIFIER.
            //
            // CaseListItemResponse strips the name, the worker code and the
            // zone from a confidential complaint precisely because each of them
            // narrows it to one person on a small estate. A recording of that
            // person speaking defeats all three at once -- an admin who has met
            // them knows who it is in two seconds, and the "গোপনীয়" label on
            // the screen becomes a promise the system did not keep.
            //
            // The UI hides the recorder when confidential is ticked. This is
            // the enforcement: the UI can be bypassed, a stale tab cannot, and
            // the one thing that must not happen is a worker believing they
            // filed anonymously when they did not.
            if (confidential) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "গোপনীয় অভিযোগে কণ্ঠের রেকর্ডিং পাঠানো যায় না — "
                                + "কণ্ঠ শুনে আপনাকে চেনা যাবে। লিখে জানান।");
            }
            if (!EVIDENCE_URL.matcher(evidenceUrl.trim()).matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "রেকর্ডিং ঠিকভাবে যায়নি। আবার চেষ্টা করুন।");
            }
            evidenceUrl = evidenceUrl.trim();
        } else {
            evidenceUrl = null;
        }

        CasePriority pri;
        try {
            pri = priority == null || priority.isBlank()
                    ? CasePriority.MEDIUM
                    : CasePriority.valueOf(priority.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "জরুরিতার মাত্রা ঠিক নয়।");
        }

        FieldCase c = caseRepository.save(FieldCase.builder()
                .caseType(CaseType.COMPLAINT)
                .category(category == null || category.isBlank() ? "অন্যান্য" : category.trim())
                .title(title.trim())
                .body(body.trim())
                // Still recorded even when confidential -- the DTOs strip it on
                // the way out. See FieldCase.confidential.
                .submitterName(w.getFullName())
                .submitterRole("worker")
                .submittedBy(w.getUserId())
                .workerCode("CG-" + w.getId())
                .zone(zoneName(w.getZoneId()))
                .priority(pri)
                .status(CaseStatus.OPEN)
                .confidential(confidential)
                .incidentDate(incidentDate)
                .clientUuid(clientUuid)
                // The voice note, if they recorded one.
                //
                // IT IS SET HERE, AT CREATION, ON PURPOSE. The obvious
                // alternative -- upload, create, then PUT /complaints/{id}/
                // evidence -- would work, but that endpoint is
                // @PreAuthorize("isAuthenticated()") and takes the case id from
                // the URL, so a worker calling it could overwrite the evidence
                // on a case that is not theirs. Setting the field on the row we
                // just built for this worker keeps the worker tier's rule
                // intact: no id ever comes from the client.
                .evidenceUrl(evidenceUrl)
                .build());

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("title", c.getTitle());
        m.put("status", c.getStatus().name());
        m.put("confidential", c.isConfidential());
        m.put("createdAt", c.getCreatedAt());
        m.put("evidenceUrl", c.getEvidenceUrl());
        return m;
    }

    // ---- borrowing ----------------------------------------------------------

    // The estate's standard instalment when a loan has no rate of its own yet.
    // A request has no dailyDeduction until an admin sets one, so without this
    // the affordability panel could show nothing at all on the screen where it
    // matters most.
    private static final BigDecimal DEFAULT_DAILY_DEDUCTION = new BigDecimal("20");

    // Typical working days in a month, used only to turn a day count into
    // months when the worker has no attendance history to measure.
    private static final int ASSUMED_WORKING_DAYS = 24;

    // What borrowing `amount` would actually cost this worker.
    //
    // Deliberately a READ. It computes and returns; it creates nothing. The
    // request is a separate call the worker makes after seeing this.
    @Transactional(readOnly = true)
    public LoanAffordability affordability(BigDecimal amount) {
        Worker w = me();
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "টাকার পরিমাণ শূন্যের বেশি হতে হবে।");
        }

        // Existing debt, so the answer is "what will I owe", not "what am I
        // borrowing".
        BigDecimal outstanding = BigDecimal.ZERO;
        BigDecimal rate = null;
        for (Loan l : loanRepository.findByWorkerIdAndStatusInOrderByIdAsc(
                w.getId(), List.of(LoanStatus.ACTIVE, LoanStatus.OVERDUE))) {
            BigDecimal left = nz(l.getPrincipal()).subtract(nz(l.getRepaid()));
            if (left.signum() > 0) outstanding = outstanding.add(left);
            // Reuse the rate they are already on rather than inventing one.
            if (rate == null && nz(l.getDailyDeduction()).signum() > 0) {
                rate = nz(l.getDailyDeduction());
            }
        }
        if (rate == null) rate = DEFAULT_DAILY_DEDUCTION;

        Integer days = rate.signum() > 0
                ? amount.divide(rate, 0, java.math.RoundingMode.CEILING).intValue()
                : null;

        // Their OWN attendance rate over the last 90 days. A worker who manages
        // 18 days a month does not clear a 75-day loan in three months, and
        // telling them otherwise is the kind of small lie that makes the whole
        // screen untrustworthy.
        LocalDate today = LocalDate.now();
        long worked = attendanceRepository
                .findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(w.getId(), today.minusDays(90), today)
                .stream()
                .filter(a -> a.getStatus() == AttendanceStatus.present
                        || a.getStatus() == AttendanceStatus.late)
                .count();
        int perMonth = worked > 0 ? (int) Math.round(worked / 3.0) : ASSUMED_WORKING_DAYS;
        if (perMonth <= 0) perMonth = ASSUMED_WORKING_DAYS;
        Integer months = days == null ? null
                : (int) Math.ceil(days / (double) perMonth);

        // Their own recent take-home, to size the instalment against.
        MyWages wages = wages();
        List<MyWages.Period> paid = wages.history().stream()
                .filter(p -> "paid".equals(p.status()))
                .limit(3)
                .toList();
        BigDecimal avgNet = null;
        if (!paid.isEmpty()) {
            BigDecimal sum = paid.stream()
                    .map(MyWages.Period::netPayable)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            avgNet = sum.divide(BigDecimal.valueOf(paid.size()), 0, java.math.RoundingMode.HALF_UP);
        }

        BigDecimal monthlyInstalment = rate.multiply(BigDecimal.valueOf(perMonth));
        Integer pct = (avgNet != null && avgNet.signum() > 0)
                ? monthlyInstalment.multiply(BigDecimal.valueOf(100))
                    .divide(avgNet, 0, java.math.RoundingMode.HALF_UP).intValue()
                : null;

        String caveat = null;
        if (avgNet == null) {
            caveat = "আপনার আগের কোনো পরিশোধিত বেতন নেই, তাই কিস্তি আয়ের কত অংশ "
                    + "তা এখন বলা যাচ্ছে না।";
        } else if (worked == 0) {
            caveat = "আপনার সাম্প্রতিক হাজিরার তথ্য নেই, তাই সময়ের হিসাব আনুমানিক।";
        }

        return new LoanAffordability(amount, rate, days, months,
                outstanding, outstanding.add(amount), avgNet, pct, caveat);
    }

    // File a loan request for THIS worker.
    //
    // WHAT THIS DOES NOT DO: approve anything.
    //
    //   The row is created with status PENDING and no dailyDeduction. Only
    //   LoanService.decide(), which is hasRole('ADMIN'), can move it to ACTIVE
    //   and put money in someone's hand. That separation is the same one
    //   LoanScoringService states for the admin side -- "Nothing here approves
    //   or rejects anything" -- and it is why a one-tap button is safe: the tap
    //   asks, it does not borrow.
    //
    //   No model is involved in this method at all. The affordability note the
    //   worker read beforehand is advisory text; it has no bearing on what gets
    //   written here.
    @Transactional
    public Map<String, Object> requestLoan(BigDecimal amount, String reason) {
        Worker w = me();
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "টাকার পরিমাণ শূন্যের বেশি হতে হবে।");
        }

        // One open request at a time. Without this a worker can file four
        // requests in a minute and the office cannot tell which is real -- and
        // if two were approved, both instalments come out of the same wage.
        boolean open = loanRepository
                .findByWorkerIdAndStatusInOrderByIdAsc(w.getId(), List.of(LoanStatus.PENDING))
                .stream().findAny().isPresent();
        if (open) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "আপনার একটি ঋণের আবেদন এখনো বিবেচনাধীন আছে।");
        }

        // AN UNPAID LOAN BLOCKS A NEW ONE.
        //
        // This is the rule that keeps a loan from becoming permanent. Stacking
        // a second loan on an unpaid first is how the balance stops falling:
        // two instalments come out of one wage, the net floors at zero, the
        // shortfall goes back onto the debt, and it never closes -- which is
        // failure three in CHA_GHOR_IDEA.md §1, in three steps.
        //
        // Enforced HERE and not only in the UI, because a disabled button is a
        // suggestion. Money rules belong on the server.
        BigDecimal owed = BigDecimal.ZERO;
        for (Loan l : loanRepository.findByWorkerIdAndStatusInOrderByIdAsc(
                w.getId(), List.of(LoanStatus.ACTIVE, LoanStatus.OVERDUE))) {
            BigDecimal left = nz(l.getPrincipal()).subtract(nz(l.getRepaid()));
            if (left.signum() > 0) owed = owed.add(left);
        }
        if (owed.signum() > 0) {
            // Names the balance and points at the thing they CAN do, rather
            // than refusing and leaving them stuck.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "আপনার আগের ঋণ থেকে এখনো ৳" + owed.setScale(0, java.math.RoundingMode.HALF_UP)
                            + " বাকি আছে। সেটি শোধ হলে নতুন ঋণের আবেদন করতে পারবেন। "
                            + "জরুরি প্রয়োজনে অগ্রিমের আবেদন করুন।");
        }

        // THE CEILING, from payroll_config (V32) so the office can move it.
        //
        // Checked even though an unpaid loan already blocks a new one: the two
        // rules answer different questions. That one asks "have you cleared the
        // last one"; this asks "is this amount within estate policy at all".
        // A worker with no loan at all can still ask for ৳50,000.
        BigDecimal loanCap = dailyLedger.loanCapFor();
        if (loanCap.signum() > 0 && amount.compareTo(loanCap) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "সর্বোচ্চ ৳" + loanCap.setScale(0, java.math.RoundingMode.HALF_UP)
                            + " পর্যন্ত ঋণ নেওয়া যায়।");
        }
        if (loanCap.signum() == 0) {
            // A zero cap switches this kind of borrowing off estate-wide. Say
            // so plainly rather than failing the amount check confusingly.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "এখন ঋণ দেওয়া বন্ধ আছে। অফিসে যোগাযোগ করুন।");
        }

        Loan loan = loanRepository.save(Loan.builder()
                .workerId(w.getId())                  // from the JWT, never the body
                .workerName(w.getFullName())
                .principal(amount)
                .reason(trimOrNull(reason))
                .dailyDeduction(BigDecimal.ZERO)      // the office sets the rate
                .status(LoanStatus.PENDING)           // the office decides
                .requestedAt(java.time.OffsetDateTime.now())
                .build());

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", loan.getId());
        m.put("amount", nz(loan.getPrincipal()));
        m.put("status", loan.getStatus().name());
        m.put("requestedAt", loan.getRequestedAt());
        return m;
    }

    private static String trimOrNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    // ---- advances -----------------------------------------------------------

    // The worker's own advance requests, newest first.
    @Transactional(readOnly = true)
    public List<Map<String, Object>> advances() {
        Worker w = me();
        List<Map<String, Object>> out = new ArrayList<>();
        for (var r : withdrawalRepository.findByWorkerIdOrderByRequestedAtDesc(w.getId())) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("amount", nz(r.getAmount()));
            m.put("method", r.getMethod() == null ? null : r.getMethod().name());
            m.put("kind", r.getKind() == null ? null : r.getKind().name());
            m.put("status", r.getStatus() == null ? null : r.getStatus().name());
            m.put("requestedAt", r.getRequestedAt());
            m.put("processedAt", r.getProcessedAt());
            out.add(m);
        }
        return out;
    }

    // File an advance request for THIS worker.
    //
    // WHY THIS EXISTS RATHER THAN POINTING THE UI AT /api/v1/withdrawals
    //   That endpoint permits WORKER but reads `workerId` FROM THE REQUEST BODY.
    //   A worker calling it directly can pass a colleague's id and file an
    //   advance against their wages -- which would then be recovered from that
    //   colleague's payslip. The id never reaches the client here: it comes from
    //   the JWT, and whatever the body says is ignored.
    //
    //   The underlying endpoint still has that hole for admin and supervisor
    //   callers, who are entitled to act on another worker's behalf. Narrowing
    //   it for the WORKER role specifically is a permissions change and is
    //   flagged rather than done quietly.
    @Transactional
    // `kind` is "salary" or "advance", and it is not cosmetic.
    //
    // MECHANICALLY THESE ARE THE SAME ROW. Both pay cash out before the payslip
    // settles, and both come back through advanceRecovery. What differs is the
    // ceiling, and the ceiling is the whole point:
    //
    //   salary  -- capped at what he has ALREADY EARNED this period after both
    //              recoveries. This is his own money, released early. It cannot
    //              put him into debt, so the ৳500 advance cap does not apply.
    //   advance -- capped at the configured advance limit. This is money against
    //              days NOT YET WORKED, and it is repaid by being paid nothing
    //              at all until it clears.
    //
    // Letting one button do both would mean either capping a worker's own wages
    // at ৳500, or letting him borrow his whole month. Neither is acceptable, so
    // the caller has to say which it is and the server checks the right limit.
    public Map<String, Object> requestAdvance(BigDecimal amount, String method, String kind) {
        Worker w = me();

        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "টাকার পরিমাণ শূন্যের বেশি হতে হবে।");
        }

        // One open request at a time. Without this a worker can queue five
        // advances the office has not seen yet, and every one of them will be
        // recovered from the same payslip -- which is precisely the "advances
        // vanish, then get paid twice" failure this product exists to fix.
        // NAME WHAT IS ACTUALLY PENDING. This message used to say "your advance
        // request is pending" for ANY open row -- including a wage withdrawal,
        // which is not an advance. A worker was told he had an advance request
        // the office could not find, because it was not one.
        var pendingRow = withdrawalRepository
                .findByWorkerIdOrderByRequestedAtDesc(w.getId()).stream()
                .filter(r -> r.getStatus() == com.chaghor.chaghor.withdrawal.WithdrawalStatus.pending)
                .findFirst().orElse(null);
        if (pendingRow != null) {
            boolean wasSalary = pendingRow.getKind()
                    == com.chaghor.chaghor.withdrawal.WithdrawalKind.salary;
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    (wasSalary
                            ? "আপনার বেতন তোলার একটি আবেদন এখনো বিবেচনাধীন আছে। "
                            : "আপনার অগ্রিমের একটি আবেদন এখনো বিবেচনাধীন আছে। ")
                            + "সেটির সিদ্ধান্ত হলে নতুন আবেদন করতে পারবেন।");
        }

        boolean isSalary = kind != null && kind.trim().equalsIgnoreCase("salary");

        if (isSalary) {
            LocalDate today = LocalDate.now();
            Map<String, Object> lim = dailyLedger.limits(w, today.withDayOfMonth(1), today);
            BigDecimal available = (BigDecimal) lim.get("withdrawable");
            if (available == null || available.signum() <= 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "এখন তোলার মতো জমা টাকা নেই। কাজ করলে জমা হবে।");
            }
            if (amount.compareTo(available) > 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "এখন সর্বোচ্চ ৳" + available.setScale(0, java.math.RoundingMode.HALF_UP)
                                + " তুলতে পারবেন। বেশি লাগলে অগ্রিমের আবেদন করুন।");
            }
            var savedS = withdrawalRepository.save(
                    com.chaghor.chaghor.withdrawal.WithdrawalRequest.builder()
                            .workerId(w.getId())      // from the JWT, never the body
                            .amount(amount)
                            .method(parseMethod(method))
                            .kind(com.chaghor.chaghor.withdrawal.WithdrawalKind.salary)
                            .status(com.chaghor.chaghor.withdrawal.WithdrawalStatus.pending)
                            .build());
            Map<String, Object> ms = new LinkedHashMap<>();
            ms.put("id", savedS.getId());
            ms.put("amount", nz(savedS.getAmount()));
            ms.put("status", savedS.getStatus().name());
            ms.put("kind", "salary");
            ms.put("requestedAt", savedS.getRequestedAt());
            return ms;
        }

        // THE ADVANCE CEILING, on what may be OWED rather than on one request:
        // a worker holding ৳300 of a ৳500 cap may still ask for ৳200.
        //
        // AN ADVANCE IS NOT A WITHDRAWAL OF WAGES. It is money against days not
        // yet worked, recovered by withholding ALL daily earnings until clear --
        // so this cap is also, in plain terms, how many days the worker will be
        // paid nothing. That is why it is small, and why it is enforced here on
        // the server rather than only by a disabled button.
        BigDecimal advOwed = dailyLedger.advanceOutstanding(w.getId());
        BigDecimal advCap = dailyLedger.advanceCapFor();
        if (advCap.signum() == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "এখন অগ্রিম দেওয়া বন্ধ আছে। অফিসে যোগাযোগ করুন।");
        }
        BigDecimal room = advCap.subtract(advOwed);
        if (room.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "আপনার অগ্রিম ৳" + advOwed.setScale(0, java.math.RoundingMode.HALF_UP)
                            + " বাকি আছে, যা সর্বোচ্চ সীমা। আগে সেটি শোধ হোক।");
        }
        if (amount.compareTo(room) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "এখন সর্বোচ্চ ৳" + room.setScale(0, java.math.RoundingMode.HALF_UP)
                            + " অগ্রিম নিতে পারবেন।");
        }

        var saved = withdrawalRepository.save(
                com.chaghor.chaghor.withdrawal.WithdrawalRequest.builder()
                        .workerId(w.getId())          // from the JWT, never the body
                        .amount(amount)
                        .method(parseMethod(method))
                        .kind(com.chaghor.chaghor.withdrawal.WithdrawalKind.advance)
                        .status(com.chaghor.chaghor.withdrawal.WithdrawalStatus.pending)
                        .build());

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", saved.getId());
        m.put("amount", nz(saved.getAmount()));
        m.put("status", saved.getStatus().name());
        m.put("requestedAt", saved.getRequestedAt());
        return m;
    }

    private com.chaghor.chaghor.withdrawal.WithdrawalMethod parseMethod(String raw) {
        if (raw == null || raw.isBlank()) {
            return com.chaghor.chaghor.withdrawal.WithdrawalMethod.bkash;
        }
        try {
            // Postgres native enums are lowercase here.
            return com.chaghor.chaghor.withdrawal.WithdrawalMethod
                    .valueOf(raw.trim().toLowerCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "এই পদ্ধতিতে টাকা তোলা যায় না।");
        }
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
