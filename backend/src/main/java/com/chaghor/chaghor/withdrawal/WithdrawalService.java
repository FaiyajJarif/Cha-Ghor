package com.chaghor.chaghor.withdrawal;

import com.chaghor.chaghor.withdrawal.dto.NewWithdrawalRequest;
import com.chaghor.chaghor.withdrawal.dto.WithdrawalResponse;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Map;
import java.util.List;

// Worker cash-out requests. bKash payout is a MOCK (demo only): creating a
// request stores it as pending; an admin decides it (pay / reject) which flips
// status + stamps processed_at. No real payment gateway. Phase 3 will fire a
// mock SMS on status change (see the marked hook below).
@Service
@RequiredArgsConstructor
public class WithdrawalService {

    private final WithdrawalRepository repo;
    private final WorkerRepository workerRepository;
    private final ZoneRepository zoneRepository;
    private final com.chaghor.chaghor.sms.SmsService smsService;
    private final com.chaghor.chaghor.finance.FinanceService financeService;
    private final com.chaghor.chaghor.audit.AuditService auditService;
    private final com.chaghor.chaghor.web.DailyLedgerService dailyLedger;
    private final com.chaghor.chaghor.notification.NotificationService notifications;

    @Transactional
    public WithdrawalResponse create(NewWithdrawalRequest req) {
        if (req == null || req.workerId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "workerId is required");
        }
        Worker worker = workerRepository.findById(req.workerId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Worker not found"));
        BigDecimal amount = (req.amount() == null) ? BigDecimal.ZERO : req.amount();
        if (amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amount must be greater than 0");
        }
        WithdrawalRequest w = WithdrawalRequest.builder()
                .workerId(worker.getId())
                .amount(amount)
                .method(parseMethod(req.method()))
                .status(WithdrawalStatus.pending)
                .build();
        repo.save(w);
        return toResponse(w, worker);
    }

    @Transactional(readOnly = true)
    public List<WithdrawalResponse> list(String status) {
        WithdrawalStatus st = (status == null || status.isBlank())
                ? WithdrawalStatus.pending
                : parseStatus(status);
        List<WithdrawalResponse> out = new ArrayList<>();
        for (WithdrawalRequest w : repo.findByStatusOrderByRequestedAtDesc(st)) {
            out.add(toResponse(w, null));
        }
        return out;
    }

    @Transactional
    public WithdrawalResponse decide(Long id, String action) {
        WithdrawalRequest w = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Withdrawal request not found"));
        if (w.getStatus() != WithdrawalStatus.pending) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This request has already been decided");
        }
        String a = (action == null) ? "" : action.trim().toLowerCase();
        switch (a) {
            case "pay", "paid", "approve" -> w.setStatus(WithdrawalStatus.paid);
            case "reject", "rejected" -> w.setStatus(WithdrawalStatus.rejected);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown action: " + action);
        }
        w.setProcessedAt(OffsetDateTime.now());
        repo.save(w);

        // A PAID withdrawal is real cash leaving the estate, so it must do two
        // things that used to be missed entirely:
        //   1. post an EXPENSE-side line to the Finance ledger, and
        //   2. be recovered from this worker's wages, so the advance is netted
        //      off instead of being paid out a second time on payday.
        // v10: step 2 can no longer be silently dropped. If there is no editable
        // payslip for the current period, the recovery is PARKED and drained the
        // next time payslips are generated for that worker.
        // Both run inside this transaction, so the money can never diverge from
        // the status flip. A REJECTED request touches neither.
        if (w.getStatus() == WithdrawalStatus.paid) {
            Worker worker = workerRepository.findById(w.getWorkerId()).orElse(null);
            String account = (worker != null && worker.getFullName() != null)
                    ? worker.getFullName()
                    : ("Worker #" + w.getWorkerId());
            financeService.postWithdrawal(w.getId(), account, w.getAmount(), LocalDate.now());

            // NO recoverAdvance CALL HERE, AND THAT IS THE POINT.
            //
            // It used to park the amount on the worker's payslip so it would be
            // netted off at month end. Under daily settlement that is a SECOND
            // recovery on top of the first, and the worker pays twice:
            //
            //   salary  -- already netted. DailyLedgerService subtracts every
            //              paid salary withdrawal (salaryReleased) from the
            //              accrued balance. Adding it to a payslip as well would
            //              take wages the worker had already been handed.
            //   advance -- already recovered. openAdvances arms the debt from
            //              THIS row's payout date and DailySettlementService
            //              works it off day by day. A payslip line would recover
            //              the same 500 a second time.
            //
            // Recovery now lives in exactly one place: daily_settlement.

            // APPROVING AN ADVANCE ALSO RELEASES WAGES ALREADY EARNED.
            //
            // An advance is money against days NOT YET WORKED. If the worker
            // has 310 taka of finished work sitting unpaid and takes a 500
            // advance, the 310 is his -- it cannot also be repaying the 500, or
            // his own wages would silently service a debt he took separately.
            // So both go out together and the debt is exactly the advance.
            //
            // A SECOND ROW, not a bigger one, and that is deliberate:
            //   * the ledger keeps wages and borrowing as separate entries,
            //     which is the distinction this whole design rests on;
            //   * the 500 cap stays auditable -- one row, one advance, one
            //     amount to compare against payroll_config.advance_cap;
            //   * the admin queue can show both lines and their total.
            //
            // From this moment every taka the worker earns goes to the advance
            // until it clears. DailyLedgerService only starts that recovery on
            // the payout date, which is why this row is stamped `paid` now.
            if (w.getKind() == WithdrawalKind.advance && worker != null) {
                releaseEarnedWages(worker, w.getId());
            }
        }

        // Phase 3: notify the worker of the decision via the (mock) SMS module.
        // Best-effort + its own transaction, so it can never roll back the decision.
        smsService.notifyWithdrawalStatus(w.getWorkerId(), w.getAmount(), w.getStatus().name());

        // A paid withdrawal moves real cash over bKash, so record who released it.
        auditService.recordTransition("withdrawal_request", w.getId(), "pending",
                w.getStatus().name(),
                com.chaghor.chaghor.audit.AuditService.details(
                        "amount", w.getAmount() == null ? BigDecimal.ZERO : w.getAmount(),
                        "workerId", w.getWorkerId(),
                        "method", w.getMethod().name(),
                        "kind", w.getKind().name()));

        // Bell. The SMS above reaches the worker's phone; this reaches the app
        // in their hand, which until now showed a pending request unchanged
        // long after the office had decided it.
        //
        // Best-effort and LAST — after the cash posting, the recovery and the
        // audit row. A socket failure must never fail a payment that committed.
        try {
            boolean paid = w.getStatus() == WithdrawalStatus.paid;
            boolean advance = w.getKind() == WithdrawalKind.advance;
            notifications.send(
                    paid
                            ? (advance ? "অগ্রিম অনুমোদিত" : "বেতন পাঠানো হয়েছে")
                            : (advance ? "অগ্রিমের আবেদন গ্রহণ করা হয়নি"
                                       : "বেতন তোলার আবেদন গ্রহণ করা হয়নি"),
                    paid
                            ? "বিকাশে টাকা পাঠানো হয়েছে।"
                            : "আপনার আবেদন এবার গ্রহণ করা হয়নি।",
                    "withdrawal.decided", w.getId());
        } catch (Exception ignored) {
            // best-effort by design
        }

        return toResponse(w, null);
    }

    // ---- helpers ----
    // Pay out whatever this worker has already earned but not yet drawn.
    // Called only when an ADVANCE is approved. Does nothing when the balance is
    // zero -- an empty row would clutter the queue and post a zero to Finance.
    private void releaseEarnedWages(Worker worker, Long advanceId) {
        java.time.LocalDate today = LocalDate.now();
        BigDecimal earned;
        try {
            Map<String, Object> lim =
                    dailyLedger.limits(worker, today.withDayOfMonth(1), today);
            earned = (BigDecimal) lim.get("withdrawable");
        } catch (Exception e) {
            // Never fail an approval that has already moved money because the
            // wage balance could not be worked out. The advance stands; the
            // worker can request his wages himself.
            return;
        }
        if (earned == null || earned.signum() <= 0) {
            return;
        }

        WithdrawalRequest wages = WithdrawalRequest.builder()
                .workerId(worker.getId())
                .amount(earned)
                .method(WithdrawalMethod.bkash)
                .kind(WithdrawalKind.salary)     // wages, not a debt
                .status(WithdrawalStatus.paid)   // released in the same moment
                .build();
        wages.setProcessedAt(java.time.OffsetDateTime.now());
        repo.save(wages);

        String account = worker.getFullName() != null
                ? worker.getFullName() : ("Worker #" + worker.getId());
        financeService.postWithdrawal(wages.getId(), account, earned, today);
        // Nothing to recover: this is the worker's OWN earned wage being handed
        // over early, not a debt. The row is kind=salary, so salaryReleased()
        // nets it off the accrued balance on the next read and the worker cannot
        // draw the same taka twice. advanceId is kept only for the audit trail.
    }

    private WithdrawalResponse toResponse(WithdrawalRequest w, Worker known) {
        Worker worker = (known != null) ? known : workerRepository.findById(w.getWorkerId()).orElse(null);
        String workerName = (worker != null) ? worker.getFullName() : null;
        String zone = (worker != null && worker.getZoneId() != null)
                ? zoneRepository.findById(worker.getZoneId()).map(Zone::getName).orElse(null)
                : null;
        return new WithdrawalResponse(
                w.getId(), w.getWorkerId(), workerName, zone,
                w.getAmount(), w.getMethod().name(), w.getStatus().name(),
                w.getKind().name(),
                w.getRequestedAt(), w.getProcessedAt());
    }

    private WithdrawalMethod parseMethod(String m) {
        if (m == null || m.isBlank()) return WithdrawalMethod.bkash;
        try {
            return WithdrawalMethod.valueOf(m.trim().toLowerCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported method: " + m);
        }
    }

    private WithdrawalStatus parseStatus(String s) {
        try {
            return WithdrawalStatus.valueOf(s.trim().toLowerCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + s);
        }
    }
}
