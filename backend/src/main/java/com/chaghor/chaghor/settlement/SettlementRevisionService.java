package com.chaghor.chaghor.settlement;

import com.chaghor.chaghor.loan.LoanService;
import com.chaghor.chaghor.notification.NotificationService;
import com.chaghor.chaghor.withdrawal.WithdrawalKind;
import com.chaghor.chaghor.withdrawal.WithdrawalRepository;
import com.chaghor.chaghor.withdrawal.WithdrawalRequest;
import com.chaghor.chaghor.withdrawal.WithdrawalStatus;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

// What happens when a day that was ALREADY SETTLED turns out to be wrong.
//
// ============================================================================
// THE SITUATION
// ============================================================================
// A supervisor mis-keys a weight. Settlement runs at 00:30. The next morning
// the weigh-in is corrected. By then the estate has already moved money:
// loan.repaid went up, a loan_in row is in the ledger, an advance was reduced,
// and the worker may have withdrawn what the day produced.
//
// Recomputing the day is not enough. The old money has to be un-moved first.
//
// ============================================================================
// WHY THE WHOLE TAIL IS REVERSED, NOT JUST THE ONE DAY
// ============================================================================
// The daily split is CHRONOLOGICAL. What day 5 takes for a loan changes what is
// left for day 6, which changes day 7. Correcting day 5 alone would leave every
// later day computed against a balance that no longer exists -- the arithmetic
// would still "close" on each row while the sequence as a whole was wrong,
// which is the worst kind of broken because nothing looks broken.
//
// So a correction reverses day N and every settled day after it, then lets
// DailySettlementService re-settle the run in order. Once the tail is reversed,
// the ordinary resume-from-last-settled logic starts at exactly the right day,
// so no special-case settling is needed.
//
// ============================================================================
// NOTHING IS CLAWED BACK
// ============================================================================
// If the worker already withdrew more than the corrected day was worth, the
// difference becomes a wage_overdraw and is worked off from future earnings.
// No cash is demanded from a tea plucker because an office record changed.
@Service
@RequiredArgsConstructor
public class SettlementRevisionService {

    private static final Logger log = LoggerFactory.getLogger(SettlementRevisionService.class);

    private final DailySettlementRepository repo;
    private final WageOverdrawRepository overdrawRepository;
    private final LoanService loanService;
    private final DailySettlementService settlementService;
    private final WorkerRepository workerRepository;
    private final WithdrawalRepository withdrawalRepository;
    private final NotificationService notifications;

    // Call after attendance or leaf for `date` has been changed and COMMITTED.
    //
    // REQUIRES_NEW, and every caller wraps it in a try/catch. A correction that
    // cannot be applied must never roll back the supervisor's edit -- losing
    // the corrected weight to protect the accounting would be exactly backwards.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onDayChanged(Long workerId, LocalDate date, String reason) {
        if (workerId == null || date == null) {
            return;
        }
        List<DailySettlement> tail = repo
                .findByWorkerIdAndWorkDateGreaterThanEqualAndReversedAtIsNullOrderByWorkDateAsc(
                        workerId, date);
        if (tail.isEmpty()) {
            return;     // never settled, so there is nothing to undo
        }

        Worker w = workerRepository.findById(workerId).orElse(null);
        String who = (w != null && w.getFullName() != null)
                ? w.getFullName() : ("Worker #" + workerId);
        String why = (reason == null || reason.isBlank())
                ? ("Record for " + date + " changed after settlement")
                : reason;

        OffsetDateTime now = OffsetDateTime.now();
        BigDecimal payableUndone = BigDecimal.ZERO;

        for (DailySettlement row : tail) {
            // Un-move the loan money this day caused. Reverses exactly the
            // repayment rows stamped with this settlement id.
            loanService.reverseRecovery(row.getId(), why);

            // The advance recovery needs no compensating write: the outstanding
            // advance is DERIVED by subtracting settled to_advance from the
            // advances paid out, and openAdvances skips reversed rows. Stamping
            // this row restores the balance by itself.
            row.setReversedAt(now);
            row.setReversalReason(why);
            repo.save(row);

            payableUndone = payableUndone.add(nz(row.getPayable()));
        }

        // Re-settle the run. The tail is reversed, so resume-from-last-settled
        // now begins at `date` on its own.
        List<DailySettlement> fresh = settlementService.settleWorker(workerId);

        BigDecimal payableNow = BigDecimal.ZERO;
        for (DailySettlement r : fresh) {
            if (!r.getWorkDate().isBefore(date)) {
                payableNow = payableNow.add(nz(r.getPayable()));
            }
        }

        // ---- has the worker already been paid more than now stands? --------
        //
        // Only what he actually DREW matters. A reduction he never withdrew
        // costs him nothing and must not be recorded as a debt.
        BigDecimal overpaid = BigDecimal.ZERO;
        if (payableNow.compareTo(payableUndone) < 0) {
            BigDecimal shortfall = payableUndone.subtract(payableNow);
            BigDecimal drawn = salaryDrawnSince(workerId, date);
            overpaid = shortfall.min(drawn).max(BigDecimal.ZERO);
        }

        if (overpaid.signum() > 0) {
            overdrawRepository.save(WageOverdraw.builder()
                    .workerId(workerId)
                    .amount(overpaid.setScale(2, RoundingMode.HALF_UP))
                    .workDate(date)
                    .settlementId(tail.get(0).getId())
                    .reason(why)
                    .build());
            log.warn("[revision] {} overpaid {} for {} onward; carried as overdraw",
                    who, overpaid, date);
        }

        // ---- tell the office -----------------------------------------------
        //
        // Best-effort and last. A socket failure must never undo a correction
        // that has already committed.
        try {
            String body = who + " — " + date + " changed after settlement. "
                    + (overpaid.signum() > 0
                       ? ("৳" + overpaid.setScale(0, RoundingMode.HALF_UP)
                          + " was already withdrawn and is now being recovered.")
                       : "Balances corrected; nothing was overpaid.");
            notifications.send("Settlement corrected", body, "settlement.revised", workerId);
        } catch (Exception ignored) {
            // best-effort by design
        }

        log.info("[revision] worker {} from {}: {} days reversed, {} re-settled, overdraw {}",
                workerId, date, tail.size(), fresh.size(), overpaid);
    }

    // Salary the worker has actually been paid for the affected stretch.
    //
    // Advances are excluded deliberately: an advance is a debt already tracked
    // in its own right, and counting it here would record the same money twice.
    private BigDecimal salaryDrawnSince(Long workerId, LocalDate date) {
        BigDecimal drawn = BigDecimal.ZERO;
        for (WithdrawalRequest r : withdrawalRepository
                .findByWorkerIdOrderByRequestedAtDesc(workerId)) {
            if (r.getStatus() != WithdrawalStatus.paid) continue;
            if (r.getKind() != WithdrawalKind.salary) continue;
            LocalDate on = r.getProcessedAt() != null
                    ? r.getProcessedAt().toLocalDate()
                    : (r.getRequestedAt() != null ? r.getRequestedAt().toLocalDate() : null);
            if (on == null || on.isBefore(date)) continue;
            drawn = drawn.add(nz(r.getAmount()));
        }
        return drawn;
    }

    private static BigDecimal nz(BigDecimal b) {
        return b == null ? BigDecimal.ZERO : b;
    }
}
