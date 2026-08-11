package com.chaghor.chaghor.web;

import com.chaghor.chaghor.attendance.Attendance;
import com.chaghor.chaghor.attendance.AttendanceRepository;
import com.chaghor.chaghor.attendance.AttendanceStatus;
import com.chaghor.chaghor.leaf.LeafCollection;
import com.chaghor.chaghor.leaf.LeafCollectionRepository;
import com.chaghor.chaghor.leaf.LeafGrade;
import com.chaghor.chaghor.loan.Loan;
import com.chaghor.chaghor.loan.LoanRepository;
import com.chaghor.chaghor.loan.LoanStatus;
import com.chaghor.chaghor.payroll.Payroll;
import com.chaghor.chaghor.payroll.PayrollConfig;
import com.chaghor.chaghor.payroll.PayrollConfigRepository;
import com.chaghor.chaghor.payroll.PayrollRepository;
import com.chaghor.chaghor.payroll.PayrollStatus;
import com.chaghor.chaghor.withdrawal.WithdrawalKind;
import com.chaghor.chaghor.withdrawal.WithdrawalRepository;
import com.chaghor.chaghor.withdrawal.WithdrawalRequest;
import com.chaghor.chaghor.withdrawal.WithdrawalStatus;
import com.chaghor.chaghor.worker.Worker;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// The worker's money, day by day.
//
// ============================================================================
// THIS SERVICE MOVES NO MONEY. IT IS A PROJECTION, AND THAT IS THE POINT.
// ============================================================================
//
// This computes what a day is WORTH. DailySettlementService is what records
// that a day has been SETTLED, and it is the only thing that moves a balance.
// Keeping the arithmetic and the record in separate classes is deliberate: a
// projection that also writes is how a screen refresh becomes a second
// deduction.
//
// THE ESTATE PAYS DAILY. It did not always: until recently the only moment
// money moved was a monthly payslip going to `paid`, which meant the payslip
// WAS the payment. That produced a payslip paid on the 7th for a period ending
// the 31st, freezing 24 days of work out of payroll for good. The payslip is
// now a statement; settlement happens per day and cash leaves when the worker
// withdraws.
//
// The identity that keeps this honest:
//
//     earned = toLoan + toAdvance + payable      for every single day
//
// daily_settlement enforces it with a CHECK constraint rather than trusting
// this class, because if those ever disagree the worker is being shown one
// number and paid another.
//
// ---------------------------------------------------------------------------
// ORDER OF RECOVERY
// ---------------------------------------------------------------------------
// From each day's earnings, in this order:
//
//   1. ঋণ  -- EACH live loan takes its own `loan.daily_deduction`, capped by
//             what that loan still owes and by the day's earnings. The worker
//             keeps the rest, so a loan never leaves them with nothing.
//
//             THE RATE IS PER LOAN, not estate-wide. payroll_config's
//             loan_daily_deduction is only the DEFAULT applied when a loan is
//             approved. Reading the config here instead of the loan row made
//             this screen quote ৳20/day while the payslip charged ৳75 and ৳45
//             to different workers, with nothing explaining the gap.
//   2. অগ্রিম -- EVERYTHING remaining, until it is clear. An advance is money
//             borrowed against days not yet worked, so it is repaid by not
//             being paid. This is why the cap matters: ৳500 against a ৳170 day
//             is three days with no income whatsoever.
//   3. the worker.
//
// The loan goes first deliberately. If the advance took everything, a loan
// running underneath would stall for weeks and its own end date would drift
// every time the worker borrowed again.
//
// ---------------------------------------------------------------------------
// A DAY WITH NO EARNINGS DEDUCTS NOTHING
// ---------------------------------------------------------------------------
// Absent, on leave, or simply no attendance row: earnings are zero, so both
// recoveries take zero and the balances are untouched. Illness must never
// deepen a debt. This falls out of min(rate, earnings, owed) rather than being
// special-cased, which is why there is no branch for it below.
@Service
@RequiredArgsConstructor
public class DailyLedgerService {

    private final AttendanceRepository attendanceRepository;
    private final LeafCollectionRepository leafRepository;
    private final LoanRepository loanRepository;
    private final PayrollRepository payrollRepository;
    private final PayrollConfigRepository configRepository;
    private final WithdrawalRepository withdrawalRepository;
    private final com.chaghor.chaghor.settlement.DailySettlementRepository settlementRepository;
    private final com.chaghor.chaghor.settlement.WageOverdrawRepository overdrawRepository;

    // Loans that are actually being recovered. PENDING has not been approved,
    // REJECTED never will be, REPAID is finished -- none of them touch pay.
    private static final List<LoanStatus> LIVE_LOANS =
            List.of(LoanStatus.ACTIVE, LoanStatus.OVERDUE);

    // ---- what the worker owes ----------------------------------------------

    // Advances that are still being repaid, each with the DATE it was paid out.
    //
    // THE DATE IS THE WHOLE FIX. An earlier version summed the outstanding
    // advance into one number and applied it to every day in the period --
    // including days the worker had ALREADY WORKED before the advance existed.
    // A worker with 310 taka earned who then took a 500 advance saw his 310
    // silently consumed: money he had earned was used to repay a facility he
    // took afterwards, without being asked.
    //
    // An advance is money against days NOT YET WORKED. That is its definition,
    // and it is why the cap is small. So it can only be recovered from days on
    // or after the day it was handed over.
    //
    // Wage releases (kind = salary) are NOT here. They are not a debt: nothing
    // is withheld for them. They are subtracted from the accrued balance in
    // ledger() instead, because the worker already has that money.
    @Transactional(readOnly = true)
    public List<Advance> openAdvances(Long workerId) {
        // How much of this worker's advances has already been recovered.
        //
        // TWO SOURCES, AND BOTH ARE REAL HISTORY:
        //
        //   1. daily_settlement.to_advance -- the daily model. This is where
        //      recovery happens now: a day is settled once and its share of the
        //      advance comes off then.
        //   2. advanceRecovery on PAID payslips -- the old monthly model. Those
        //      payments actually happened, so they must keep counting or every
        //      historic advance would spring back into life as outstanding.
        //
        // Counting only (2) was correct until the estate moved to daily
        // settlement; counting only (1) would resurrect settled debts from
        // before the change.
        BigDecimal recovered = BigDecimal.ZERO;
        for (var st : settlementRepository
                .findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(
                        workerId, LocalDate.of(2000, 1, 1), LocalDate.now())) {
            // A reversed row's recovery was undone. Counting it would leave the
            // worker's advance looking smaller than it is, and he would be
            // allowed to borrow against money he has not actually repaid.
            if (st.getReversedAt() != null) {
                continue;
            }
            recovered = recovered.add(nz(st.getToAdvance()));
        }
        for (Payroll p : payrollRepository.findAll()) {
            if (!workerId.equals(p.getWorkerId())) continue;
            if (p.getStatus() != PayrollStatus.paid) continue;
            recovered = recovered.add(nz(p.getAdvanceRecovery()));
        }

        List<WithdrawalRequest> paid = new ArrayList<>();
        for (WithdrawalRequest r : withdrawalRepository
                .findByWorkerIdOrderByRequestedAtDesc(workerId)) {
            if (r.getStatus() != WithdrawalStatus.paid) continue;
            paid.add(r);
        }
        // Oldest first, so `recovered` is consumed against the oldest debt --
        // the same order the payslips took it in.
        paid.sort(Comparator.comparing(
                (WithdrawalRequest r) -> payoutDate(r),
                Comparator.nullsFirst(Comparator.naturalOrder())));

        List<Advance> open = new ArrayList<>();
        for (WithdrawalRequest r : paid) {
            BigDecimal amt = nz(r.getAmount());
            // A wage release is settled the same way on the payslip, so it eats
            // into `recovered` too -- but it never becomes an open debt.
            BigDecimal used = min(recovered, amt);
            recovered = recovered.subtract(used);
            BigDecimal left = amt.subtract(used);
            if (left.signum() <= 0) continue;
            if (r.getKind() != WithdrawalKind.advance) continue;
            open.add(new Advance(payoutDate(r), scale(left)));
        }
        return open;
    }

    // Paid-out advances still owed, as one figure. Derived from the same list
    // the day walk uses, so the card and the day list can never disagree --
    // which they did: the card said 500 owed while the ledger had already
    // consumed 310 of it.
    @Transactional(readOnly = true)
    public BigDecimal advanceOutstanding(Long workerId) {
        BigDecimal t = BigDecimal.ZERO;
        for (Advance a : openAdvances(workerId)) t = t.add(a.amount());
        return scale(t);
    }

    // Wages released early, in a window. Not a debt -- the worker has it, so it
    // is subtracted from what has accrued rather than withheld from future days.
    private BigDecimal salaryReleased(Long workerId, LocalDate from, LocalDate to) {
        BigDecimal t = BigDecimal.ZERO;
        for (WithdrawalRequest r : withdrawalRepository
                .findByWorkerIdOrderByRequestedAtDesc(workerId)) {
            if (r.getKind() != WithdrawalKind.salary) continue;
            // Pending counts too: the money is spoken for, and showing it as
            // still withdrawable would let it be requested twice.
            if (r.getStatus() == WithdrawalStatus.rejected) continue;
            LocalDate d = payoutDate(r);
            if (d == null || d.isBefore(from) || d.isAfter(to)) continue;
            t = t.add(nz(r.getAmount()));
        }
        return scale(t);
    }

    private static LocalDate payoutDate(WithdrawalRequest r) {
        if (r.getProcessedAt() != null) return r.getProcessedAt().toLocalDate();
        return r.getRequestedAt() != null ? r.getRequestedAt().toLocalDate() : null;
    }

    // One paid-out advance: when it was handed over, and how much is still owed.
    public record Advance(LocalDate paidOn, BigDecimal amount) {}

    @Transactional(readOnly = true)
    public BigDecimal loanOutstanding(Long workerId) {
        BigDecimal owed = BigDecimal.ZERO;
        for (OpenLoan l : openLoans(workerId)) {
            owed = owed.add(l.owed());
        }
        return scale(owed);
    }

    // Live loans, each with ITS OWN daily rate.
    //
    // THE RATE COMES FROM THE LOAN, NOT FROM payroll_config.
    //   PayrollService.recompute charges the worker
    //   `loan.daily_deduction x present days` (via LoanService.plannedDeduction).
    //   This service used to read the estate-wide config value instead, so the
    //   worker's daily screen quoted ৳20/day while their payslip deducted
    //   whatever was on their loan row -- ৳75 for one worker, ৳45 for another,
    //   with nothing on any screen explaining the difference.
    //
    //   payroll_config.loan_daily_deduction is the DEFAULT applied to a new
    //   loan at approval (LoanService.decide). Once a loan exists, its own
    //   column is the truth, because that is the number that charges.
    @Transactional(readOnly = true)
    public List<OpenLoan> openLoans(Long workerId) {
        List<OpenLoan> out = new ArrayList<>();
        for (Loan l : loanRepository.findByWorkerIdAndStatusInOrderByIdAsc(workerId, LIVE_LOANS)) {
            BigDecimal owed = nz(l.getPrincipal()).subtract(nz(l.getRepaid()));
            // A loan overpaid by a rounding taka must not read as credit.
            if (owed.signum() <= 0) continue;
            out.add(new OpenLoan(l.getId(), l.getReference(), scale(owed),
                    scale(nz(l.getDailyDeduction()))));
        }
        return out;
    }

    // One live loan: what is still owed, and what it takes per working day.
    public record OpenLoan(Long id, String reference, BigDecimal owed, BigDecimal perDay) {}

    // ---- the configured ceilings -------------------------------------------

    // Exposed so the request paths in MeWorkerService enforce the SAME number
    // this service reports. Two copies of a limit is how a screen ends up
    // offering ৳500 that the server then refuses.

    @Transactional(readOnly = true)
    public BigDecimal advanceCapFor() {
        return scale(nz(currentConfig().getAdvanceCap()));
    }

    @Transactional(readOnly = true)
    public BigDecimal loanCapFor() {
        return scale(nz(currentConfig().getLoanCap()));
    }

    // ---- what a single day is worth ----------------------------------------

    // The wage formula for ONE day. Identical in structure to
    // PayrollService.recompute, but per-day rather than summed over a period.
    //
    // SURPLUS IS PER DAY, and that is not a detail. Summing kilos over a month
    // and subtracting one quota would let a 40kg day be cancelled by a 10kg day
    // and pay the worker nothing for either. CLAUDE.md section 7.
    private BigDecimal earningsFor(AttendanceStatus status, BigDecimal kg,
                                   BigDecimal gradeAKg, PayrollConfig cfg) {
        // `late` pays a full day. Absent and leave pay nothing -- and pay
        // nothing even if leaf was weighed in, because the base is attendance.
        if (status != AttendanceStatus.present && status != AttendanceStatus.late) {
            return BigDecimal.ZERO;
        }
        BigDecimal surplus = nz(kg).subtract(nz(cfg.getLeafQuotaKg()));
        if (surplus.signum() < 0) {
            surplus = BigDecimal.ZERO;
        }
        return scale(nz(cfg.getBaseDailyWage())
                .add(surplus.multiply(nz(cfg.getSurplusRate())))
                .add(nz(gradeAKg).multiply(nz(cfg.getGradeBonusRate()))));
    }

    // ---- the ledger ---------------------------------------------------------

    // Day-by-day for a date range: earned, taken by each debt, and what is left
    // for the worker. Days are returned oldest first.
    @Transactional(readOnly = true)
    public Map<String, Object> ledger(Worker w, LocalDate from, LocalDate to) {
        PayrollConfig cfg = currentConfig();

        Map<LocalDate, AttendanceStatus> statusByDay = new LinkedHashMap<>();
        for (Attendance a : attendanceRepository
                .findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(w.getId(), from, to)) {
            statusByDay.put(a.getWorkDate(), a.getStatus());
        }

        // Several weigh-ins in one day are ONE day, summed. Taking the largest
        // slip instead would quietly underpay anyone weighed in twice.
        Map<LocalDate, BigDecimal> kgByDay = new LinkedHashMap<>();
        Map<LocalDate, BigDecimal> gradeAByDay = new LinkedHashMap<>();
        for (LeafCollection lc : leafRepository
                .findByWorkerIdAndCollectDateBetween(w.getId(), from, to)) {
            LocalDate d = lc.getCollectDate();
            if (d == null) continue;
            kgByDay.merge(d, nz(lc.getWeightKg()), BigDecimal::add);
            if (lc.getQualityGrade() == LeafGrade.A) {
                gradeAByDay.merge(d, nz(lc.getWeightKg()), BigDecimal::add);
            }
        }

        // Dated. An advance only bites from the day it was handed over.
        List<Advance> advances = openAdvances(w.getId());
        // Each loan at its OWN rate -- the rate the payslip will actually use.
        List<OpenLoan> loans = openLoans(w.getId());
        BigDecimal[] loanLeft = loans.stream()
                .map(OpenLoan::owed).toArray(BigDecimal[]::new);

        // Running debt, grown as each advance's payout date is reached rather
        // than seeded up front.
        BigDecimal advOwed = BigDecimal.ZERO;
        int nextAdvance = 0;
        // Anything paid out BEFORE this window is already biting on day one.
        for (Advance a : advances) {
            if (a.paidOn() == null || a.paidOn().isBefore(from)) {
                advOwed = advOwed.add(a.amount());
                nextAdvance++;
            } else {
                break;
            }
        }

        // WHICH DAYS ARE ALREADY SETTLED.
        //
        // Everything below this point is a PROJECTION -- it recomputes what a
        // day is worth from attendance and leaf. A settled day is not a
        // projection: it is a recorded fact, and its loan money has already
        // moved. The two must be distinguishable on screen, because "৳20 will
        // come off" and "৳20 came off" are different sentences to a worker
        // waiting on money, and only one of them is safe to act on.
        //
        // The projection is NOT overwritten with the settled figures. If they
        // disagree, that disagreement is itself the finding, and hiding it
        // behind the recorded number is how a wage dispute becomes invisible.
        // The row carries both and flags the mismatch.
        Map<LocalDate, com.chaghor.chaghor.settlement.DailySettlement> settledByDay =
                new LinkedHashMap<>();
        for (var st : settlementRepository
                .findByWorkerIdAndWorkDateBetweenOrderByWorkDateAsc(w.getId(), from, to)) {
            // Skip reversed rows. A day corrected after settlement keeps its
            // original row as history, and treating that as the live figure
            // would show the worker the number that was withdrawn rather than
            // the one that stands.
            if (st.getReversedAt() != null) {
                continue;
            }
            settledByDay.put(st.getWorkDate(), st);
        }

        // ---- overdraw: money already paid for a day later corrected down ----
        //
        // Recovered FOURTH -- behind loan and advance, ahead of the worker.
        // Behind the advance on purpose: an advance is money the worker asked
        // for and is counting on clearing, while an overdraw is the estate's
        // own correction. Putting the estate's mistake first would stretch his
        // zero-pay run for a reason he had no part in.
        BigDecimal overdrawOwed = BigDecimal.ZERO;
        for (var o : overdrawRepository.findOpenByWorker(w.getId())) {
            overdrawOwed = overdrawOwed.add(nz(o.getAmount()).subtract(nz(o.getRecovered())));
        }
        overdrawOwed = floorZero(overdrawOwed);
        BigDecimal overdrawTotal = overdrawOwed;

        List<Map<String, Object>> rows = new ArrayList<>();
        int mismatches = 0;
        BigDecimal totalEarned = BigDecimal.ZERO;
        BigDecimal totalToLoan = BigDecimal.ZERO;
        BigDecimal totalToAdvance = BigDecimal.ZERO;
        BigDecimal totalToOverdraw = BigDecimal.ZERO;
        BigDecimal totalPayable = BigDecimal.ZERO;

        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            // Advances handed over ON this day start biting today.
            while (nextAdvance < advances.size()
                    && advances.get(nextAdvance).paidOn() != null
                    && !advances.get(nextAdvance).paidOn().isAfter(d)) {
                advOwed = advOwed.add(advances.get(nextAdvance).amount());
                nextAdvance++;
            }

            AttendanceStatus st = statusByDay.get(d);
            BigDecimal earned = st == null ? BigDecimal.ZERO
                    : earningsFor(st, kgByDay.get(d), gradeAByDay.get(d), cfg);

            // min() over three quantities is what makes a zero-earning day
            // deduct nothing, and stops either recovery overshooting the debt.
            // Every live loan takes its own daily amount, in order, bounded by
            // what the day actually earned. Matches LoanService.plannedDeduction,
            // which caps each loan's take at its own outstanding balance.
            BigDecimal left = earned;
            BigDecimal toLoan = BigDecimal.ZERO;
            for (int li = 0; li < loans.size(); li++) {
                if (left.signum() <= 0) break;
                BigDecimal cut = min(loans.get(li).perDay(), min(left, loanLeft[li]));
                if (cut.signum() <= 0) continue;
                loanLeft[li] = loanLeft[li].subtract(cut);
                left = left.subtract(cut);
                toLoan = toLoan.add(cut);
            }

            BigDecimal toAdvance = min(left, advOwed);
            left = left.subtract(toAdvance);
            advOwed = advOwed.subtract(toAdvance);

            // FOURTH: an overpayment from a day corrected after settlement.
            BigDecimal toOverdraw = min(left, overdrawOwed);
            left = left.subtract(toOverdraw);
            overdrawOwed = overdrawOwed.subtract(toOverdraw);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", d);
            row.put("status", st == null ? null : st.name());
            row.put("kg", scale1(kgByDay.get(d)));
            row.put("earned", earned);
            row.put("toLoan", toLoan);
            row.put("toAdvance", toAdvance);
            row.put("toOverdraw", toOverdraw);
            row.put("payable", left);
            row.put("advanceLeft", advOwed);
            row.put("overdrawLeft", scale(overdrawOwed));
            BigDecimal loanRemaining = BigDecimal.ZERO;
            for (BigDecimal b : loanLeft) loanRemaining = loanRemaining.add(b);
            row.put("loanLeft", scale(loanRemaining));

            // Settled, or still only a forecast?
            var st2 = settledByDay.get(d);
            row.put("settled", st2 != null);
            if (st2 != null) {
                row.put("settledAt", st2.getSettledAt());
                boolean differs =
                        scale(nz(st2.getEarned())).compareTo(scale(earned)) != 0
                     || scale(nz(st2.getToLoan())).compareTo(scale(toLoan)) != 0
                     || scale(nz(st2.getToAdvance())).compareTo(scale(toAdvance)) != 0
                     || scale(nz(st2.getToOverdraw())).compareTo(scale(toOverdraw)) != 0
                     || scale(nz(st2.getPayable())).compareTo(scale(left)) != 0;
                if (differs) {
                    // The recorded row is what actually moved; the projection is
                    // what today's data says should have. A gap means attendance
                    // or leaf was edited after the day was settled.
                    mismatches++;
                    row.put("mismatch", true);
                    row.put("settledEarned", scale(nz(st2.getEarned())));
                    row.put("settledToLoan", scale(nz(st2.getToLoan())));
                    row.put("settledToAdvance", scale(nz(st2.getToAdvance())));
                    row.put("settledToOverdraw", scale(nz(st2.getToOverdraw())));
                    row.put("settledPayable", scale(nz(st2.getPayable())));
                }
            }
            rows.add(row);

            totalEarned = totalEarned.add(earned);
            totalToLoan = totalToLoan.add(toLoan);
            totalToAdvance = totalToAdvance.add(toAdvance);
            totalToOverdraw = totalToOverdraw.add(toOverdraw);
            totalPayable = totalPayable.add(left);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("from", from);
        out.put("to", to);
        out.put("days", rows);
        out.put("totalEarned", scale(totalEarned));
        out.put("totalToLoan", scale(totalToLoan));
        out.put("totalToAdvance", scale(totalToAdvance));
        out.put("totalToOverdraw", scale(totalToOverdraw));
        // What the estate over-paid and is still working off, so a screen can
        // say WHY today pays less rather than showing an unexplained cut.
        out.put("overdrawOwed", scale(overdrawTotal));
        out.put("overdrawLeft", scale(overdrawOwed));
        out.put("totalPayable", scale(totalPayable));
        out.put("settledDays", settledByDay.size());
        out.put("mismatchedDays", mismatches);
        out.put("advanceLeft", scale(advOwed));
        BigDecimal loanRemainingTotal = BigDecimal.ZERO;
        for (BigDecimal b : loanLeft) loanRemainingTotal = loanRemainingTotal.add(b);
        out.put("loanLeft", scale(loanRemainingTotal));
        // So a screen can show WHY the daily cut is what it is, per loan.
        out.put("loans", loans);
        // Wages already handed over early in this window. Not a debt -- the
        // worker has the money -- so it is netted off the accrued balance
        // rather than withheld from any future day.
        BigDecimal released = salaryReleased(w.getId(), from, to);
        out.put("alreadyWithdrawn", released);
        out.put("withdrawable", scale(floorZero(totalPayable.subtract(released))));
        // So a screen can say "you will be paid nothing for about N more days"
        // BEFORE the worker borrows, rather than explaining it afterwards.
        out.put("daysUntilAdvanceClear", daysToClear(advOwed, averageEarning(rows)));
        return out;
    }

    // ---- limits -------------------------------------------------------------

    // What this worker may borrow right now, and what is simply theirs.
    //
    // THE THREE ARE NOT THE SAME THING, and the UI must not blur them:
    //   withdrawable -- money already EARNED. Not a debt. Nothing to recover.
    //   advance      -- borrowed against days not yet worked. Repaid by being
    //                   paid nothing at all until clear.
    //   loan         -- borrowed, repaid a fixed amount per working day.
    @Transactional(readOnly = true)
    public Map<String, Object> limits(Worker w, LocalDate periodStart, LocalDate periodEnd) {
        PayrollConfig cfg = currentConfig();
        Map<String, Object> led = ledger(w, periodStart, periodEnd);

        // Straight from the ledger, so the card and the day list cannot show
        // different numbers -- which is exactly what went wrong: the card said
        // 500 owed while the day list had already consumed 310 of it.
        BigDecimal advOwed = (BigDecimal) led.get("advanceLeft");
        BigDecimal loanOwed = (BigDecimal) led.get("loanLeft");

        // The cap is on what may be OWED, not on a single request: a worker
        // holding ৳300 of a ৳500 cap may still take ৳200.
        //
        // floorZero because lowering a cap must not produce a negative
        // "available" for somebody already above the new limit. They simply
        // cannot borrow until they have repaid.
        BigDecimal advanceAvailable = floorZero(nz(cfg.getAdvanceCap()).subtract(advOwed));
        BigDecimal loanAvailable = floorZero(nz(cfg.getLoanCap()).subtract(loanOwed));

        // Withdrawable is what the period has already produced after both
        // recoveries -- exactly the running "payable" total, which is the same
        // figure the payslip will settle.
        BigDecimal withdrawable = floorZero((BigDecimal) led.get("withdrawable"));

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("withdrawable", scale(withdrawable));
        m.put("advanceOutstanding", scale(advOwed));
        m.put("advanceCap", scale(nz(cfg.getAdvanceCap())));
        m.put("advanceAvailable", scale(advanceAvailable));
        m.put("loanOutstanding", scale(loanOwed));
        m.put("loanCap", scale(nz(cfg.getLoanCap())));
        m.put("loanAvailable", scale(loanAvailable));
        m.put("loanDailyDeduction", scale(nz(cfg.getLoanDailyDeduction())));
        m.put("alreadyWithdrawn", led.get("alreadyWithdrawn"));
        m.put("averageDailyEarning", averageEarning(asRows(led)));
        return m;
    }

    // ---- helpers ------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asRows(Map<String, Object> ledger) {
        return (List<Map<String, Object>>) ledger.get("days");
    }

    // Averaged over days actually WORKED, not calendar days. Dividing by the
    // month would make somebody who worked a fortnight look like they earn half
    // as much per day, and would then overstate how long a debt takes to clear.
    private BigDecimal averageEarning(List<Map<String, Object>> rows) {
        BigDecimal sum = BigDecimal.ZERO;
        int worked = 0;
        for (Map<String, Object> r : rows) {
            BigDecimal e = (BigDecimal) r.get("earned");
            if (e != null && e.signum() > 0) {
                sum = sum.add(e);
                worked++;
            }
        }
        return worked == 0 ? BigDecimal.ZERO
                : sum.divide(BigDecimal.valueOf(worked), 2, RoundingMode.HALF_UP);
    }

    // Rounded UP: "about 3 days" when it is 2.1 is a promise that breaks on the
    // third day. Null when there is no history to base it on -- an invented
    // number here is worse than an absent one.
    private Integer daysToClear(BigDecimal owed, BigDecimal perDay) {
        if (owed == null || owed.signum() <= 0) return 0;
        if (perDay == null || perDay.signum() <= 0) return null;
        return owed.divide(perDay, 0, RoundingMode.CEILING).intValue();
    }

    private PayrollConfig currentConfig() {
        return configRepository.findTopByOrderByEffectiveFromDescIdDesc()
                .orElseGet(() -> PayrollConfig.builder().build());
    }

    private static BigDecimal min(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) <= 0 ? a : b;
    }

    private static BigDecimal floorZero(BigDecimal b) {
        return b == null || b.signum() < 0 ? BigDecimal.ZERO : b;
    }

    private static BigDecimal scale(BigDecimal b) {
        return nz(b).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal scale1(BigDecimal b) {
        return nz(b).setScale(1, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal b) {
        return b != null ? b : BigDecimal.ZERO;
    }
}
