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
    private final com.chaghor.chaghor.payroll.PayrollService payrollService;
    private final com.chaghor.chaghor.audit.AuditService auditService;

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
            payrollService.recoverAdvance(
                    w.getWorkerId(), w.getAmount(), "withdrawal", w.getId(),
                    "bKash advance #" + w.getId());
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
                        "method", w.getMethod().name()));

        return toResponse(w, null);
    }

    // ---- helpers ----
    private WithdrawalResponse toResponse(WithdrawalRequest w, Worker known) {
        Worker worker = (known != null) ? known : workerRepository.findById(w.getWorkerId()).orElse(null);
        String workerName = (worker != null) ? worker.getFullName() : null;
        String zone = (worker != null && worker.getZoneId() != null)
                ? zoneRepository.findById(worker.getZoneId()).map(Zone::getName).orElse(null)
                : null;
        return new WithdrawalResponse(
                w.getId(), w.getWorkerId(), workerName, zone,
                w.getAmount(), w.getMethod().name(), w.getStatus().name(),
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
