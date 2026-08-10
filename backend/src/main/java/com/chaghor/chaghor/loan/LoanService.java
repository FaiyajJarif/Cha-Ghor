package com.chaghor.chaghor.loan;

import com.chaghor.chaghor.loan.dto.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.chaghor.chaghor.finance.FinanceService;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.Year;
import java.util.List;

// Business logic for the Loans & Advances module: the five KPI cards, the
// pending request queue with approve / reject, and the paginated active
// repayments table. Repayment progress (repaid / principal) is derived here,
// never stored.
@Service
public class LoanService {

    private static final List<LoanStatus> OUTSTANDING =
            List.of(LoanStatus.ACTIVE, LoanStatus.OVERDUE);
    private static final List<LoanStatus> APPROVED_EVER =
            List.of(LoanStatus.ACTIVE, LoanStatus.OVERDUE, LoanStatus.REPAID);

    private final LoanRepository repo;
    private final com.chaghor.chaghor.worker.WorkerRepository workerRepository;
    private final LoanRepaymentEntryRepository repaymentRepository;
    private final FinanceService financeService;
    private final com.chaghor.chaghor.audit.AuditService auditService;
    private final com.chaghor.chaghor.notification.NotificationService notifications;

    public LoanService(LoanRepository repo,
                       com.chaghor.chaghor.worker.WorkerRepository workerRepository,
                       LoanRepaymentEntryRepository repaymentRepository,
                       FinanceService financeService,
                       com.chaghor.chaghor.audit.AuditService auditService,
                       com.chaghor.chaghor.notification.NotificationService notifications) {
        this.repo = repo;
        this.workerRepository = workerRepository;
        this.repaymentRepository = repaymentRepository;
        this.financeService = financeService;
        this.auditService = auditService;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    public LoanSummaryResponse summary() {
        long active = repo.countByStatusIn(OUTSTANDING);
        long pending = repo.countByStatus(LoanStatus.PENDING);
        long approved = repo.countByStatusInAndDecidedAtAfter(
                APPROVED_EVER, OffsetDateTime.now().minusDays(30));
        BigDecimal recovered = nz(repo.totalRecovered());
        long overdue = repo.countByStatus(LoanStatus.OVERDUE);
        return new LoanSummaryResponse(active, pending, approved, recovered, overdue);
    }

    @Transactional(readOnly = true)
    public List<LoanRequestResponse> requests(String status) {
        LoanStatus st = (status == null || status.isBlank())
                ? LoanStatus.PENDING
                : parseStatus(status);
        return repo.findByStatusOrderByRequestedAtDesc(st).stream().map(this::toRequest).toList();
    }

    @Transactional(readOnly = true)
    public RepaymentPageResponse repayments(int page, int size) {
        int p = Math.max(page, 0);
        int s = size <= 0 ? 8 : Math.min(size, 200);
        Page<Loan> result = repo.findByStatusInOrderByReferenceAsc(OUTSTANDING, PageRequest.of(p, s));
        List<RepaymentResponse> items = result.getContent().stream().map(this::toRepayment).toList();
        return new RepaymentPageResponse(items, p, s, result.getTotalElements(), result.getTotalPages());
    }

    @Transactional
    public LoanRequestResponse create(NewLoanRequest req) {
        if (req.workerName() == null || req.workerName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Worker name is required");
        }
        BigDecimal amount = nz(req.amount());
        if (amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid amount");
        }
        Loan loan = Loan.builder()
                .workerName(req.workerName().trim())
                .workerId(resolveWorkerId(req.workerName()))
                .zone(blankToNull(req.zone()))
                .principal(amount)
                .reason(blankToNull(req.reason()))
                .dailyDeduction(nz(req.dailyDeduction()))
                .status(LoanStatus.PENDING)
                .requestedAt(OffsetDateTime.now())
                .build();
        return toRequest(repo.save(loan));
    }

    @Transactional
    // Pushing `loan.decided` at the end of this method is what puts a loan
    // decision in the worker's bell. Until now the ONLY signal was an SMS: a
    // worker with the app open watched a pending request sit there unchanged
    // after the office had already approved it.
    public LoanRequestResponse decide(Long id, String action, Long userId) {
        Loan loan = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan request not found"));
        if (loan.getStatus() != LoanStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This request has already been decided");
        }
        String a = action == null ? "" : action.toLowerCase();
        switch (a) {
            case "approve" -> {
                loan.setStatus(LoanStatus.ACTIVE);
                loan.setReference(mintReference(loan.getId()));
                if (nz(loan.getDailyDeduction()).signum() <= 0) {
                    loan.setDailyDeduction(BigDecimal.TEN);
                }
                // v10: a loan approved for a name that never matched a worker row
                // could never be auto-deducted from wages. Try again at approval
                // time -- the worker may have been created since the request.
                if (loan.getWorkerId() == null) {
                    loan.setWorkerId(resolveWorkerId(loan.getWorkerName()));
                }
            }
            case "reject" -> loan.setStatus(LoanStatus.REJECTED);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown action: " + action);
        }
        loan.setDecidedAt(OffsetDateTime.now());
        loan.setDecidedBy(userId);
        repo.save(loan);

        // Capital leaves the estate the moment a loan is approved, so post it to
        // the ledger in the same transaction. Rejected loans post nothing.
        if (loan.getStatus() == LoanStatus.ACTIVE) {
            financeService.postLoanDisbursement(loan.getId(), loan.getReference(),
                    loan.getWorkerName(), nz(loan.getPrincipal()), LocalDate.now());
        }

        // Who approved this loan, and for how much. Recorded whether it was
        // approved or rejected -- a refusal is worth being able to account for
        // too, and note the AI only ever advised here.
        auditService.recordTransition("loan", loan.getId(), "PENDING",
                loan.getStatus().name(),
                com.chaghor.chaghor.audit.AuditService.details(
                        "principal", nz(loan.getPrincipal()),
                        "workerName", loan.getWorkerName(),
                        "reference", loan.getReference(),
                        "decidedByHuman", true));

        // Bell. Best-effort and LAST: a socket failure must never fail a
        // decision that has already been written and audited.
        try {
            boolean approved = loan.getStatus() == LoanStatus.ACTIVE;
            notifications.send(
                    approved ? "ঋণ অনুমোদিত" : "ঋণের আবেদন গ্রহণ করা হয়নি",
                    approved
                            ? "আপনার ঋণের আবেদন অনুমোদন করা হয়েছে।"
                            : "আপনার ঋণের আবেদন এবার গ্রহণ করা হয়নি।",
                    "loan.decided", loan.getId());
        } catch (Exception ignored) {
            // best-effort by design, as FieldCaseService.push is
        }
        return toRequest(loan);
    }

    // Record a repayment against an ACTIVE / OVERDUE loan. Before this existed
    // nothing ever called setRepaid, so "Recovered" and every progress bar were
    // frozen at zero. Flips the loan to REPAID once fully recovered, and posts
    // the capital back into the ledger in the same transaction.
    @Transactional
    public RepaymentResponse recordRepayment(Long id, NewRepaymentRequest req, Long userId) {
        Loan loan = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan not found"));
        if (loan.getStatus() != LoanStatus.ACTIVE && loan.getStatus() != LoanStatus.OVERDUE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only an active or overdue loan can take a repayment. This one is " + loan.getStatus() + ".");
        }
        BigDecimal amount = nz(req == null ? null : req.amount());
        if (amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a repayment amount greater than 0");
        }
        BigDecimal outstanding = nz(loan.getPrincipal()).subtract(nz(loan.getRepaid()));
        if (outstanding.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This loan is already fully repaid");
        }
        if (amount.compareTo(outstanding) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Repayment exceeds the outstanding balance of " + outstanding.toPlainString());
        }

        LocalDate paidOn = (req.paidOn() == null) ? LocalDate.now() : req.paidOn();
        LoanRepaymentEntry entry = repaymentRepository.save(LoanRepaymentEntry.builder()
                .loanId(loan.getId())
                .amount(amount)
                .paidOn(paidOn)
                .note(blankToNull(req.note()))
                .recordedBy(userId)
                .build());

        loan.setRepaid(nz(loan.getRepaid()).add(amount));
        if (loan.getRepaid().compareTo(nz(loan.getPrincipal())) >= 0) {
            loan.setStatus(LoanStatus.REPAID);
        }
        repo.save(loan);

        financeService.postLoanRepayment(entry.getId(), loan.getReference(),
                loan.getWorkerName(), amount, paidOn);

        return toRepayment(loan);
    }

    // ---- v10: automatic wage deduction --------------------------------------

    // What payroll SHOULD deduct from this worker's wages this period. Pure
    // read -- changes nothing. Each outstanding loan contributes
    // dailyDeduction x present days, capped at what is actually still owed so a
    // long month can never over-recover.
    @Transactional(readOnly = true)
    public BigDecimal plannedDeduction(Long workerId, int presentDays) {
        if (workerId == null || presentDays <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal total = BigDecimal.ZERO;
        for (Loan l : repo.findByWorkerIdAndStatusInOrderByIdAsc(workerId, OUTSTANDING)) {
            BigDecimal outstanding = nz(l.getPrincipal()).subtract(nz(l.getRepaid()));
            if (outstanding.signum() <= 0) {
                continue;
            }
            BigDecimal planned = nz(l.getDailyDeduction()).multiply(BigDecimal.valueOf(presentDays));
            total = total.add(planned.min(outstanding));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    // Settle the wage deduction against real loans, oldest debt first. Called
    // once, when a payslip is marked PAID -- that is the moment the worker has
    // genuinely handed the money back. Creates a repayment entry per loan and
    // posts each one to the ledger as capital returning (loan_in).
    //
    // Idempotent per payslip: the (loan_id, payroll_id) partial unique index
    // plus the exists check below mean re-running can never double-recover.
    // Returns the amount actually applied, which can be less than requested if
    // the loans were repaid by hand in the meantime.
    @Transactional
    public BigDecimal recoverFromPayslip(Long workerId, BigDecimal amount, LocalDate on, Long payrollId) {
        BigDecimal remaining = nz(amount);
        if (workerId == null || remaining.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        LocalDate date = (on == null) ? LocalDate.now() : on;
        BigDecimal applied = BigDecimal.ZERO;
        for (Loan l : repo.findByWorkerIdAndStatusInOrderByIdAsc(workerId, OUTSTANDING)) {
            if (remaining.signum() <= 0) {
                break;
            }
            if (payrollId != null && repaymentRepository.existsByLoanIdAndPayrollId(l.getId(), payrollId)) {
                continue; // this payslip already recovered against this loan
            }
            BigDecimal outstanding = nz(l.getPrincipal()).subtract(nz(l.getRepaid()));
            if (outstanding.signum() <= 0) {
                continue;
            }
            BigDecimal take = remaining.min(outstanding);
            LoanRepaymentEntry entry = repaymentRepository.save(LoanRepaymentEntry.builder()
                    .loanId(l.getId())
                    .amount(take)
                    .paidOn(date)
                    .note("Auto-deducted from payslip #" + payrollId)
                    .payrollId(payrollId)
                    .build());

            l.setRepaid(nz(l.getRepaid()).add(take));
            if (l.getRepaid().compareTo(nz(l.getPrincipal())) >= 0) {
                l.setStatus(LoanStatus.REPAID);
            }
            repo.save(l);

            financeService.postLoanRepayment(entry.getId(), l.getReference(),
                    l.getWorkerName(), take, date);

            remaining = remaining.subtract(take);
            applied = applied.add(take);
        }
        return applied;
    }

    // ---- helpers ----
    private LoanRequestResponse toRequest(Loan l) {
        return new LoanRequestResponse(
                l.getId(), l.getWorkerName(), l.getZone(), l.getAvatarUrl(),
                nz(l.getPrincipal()), l.getReason(), l.getStatus().name(), l.getRequestedAt());
    }

    private RepaymentResponse toRepayment(Loan l) {
        BigDecimal principal = nz(l.getPrincipal());
        BigDecimal repaid = nz(l.getRepaid());
        int pct = principal.signum() <= 0 ? 0 : repaid
                .multiply(BigDecimal.valueOf(100))
                .divide(principal, 0, RoundingMode.HALF_UP)
                .min(BigDecimal.valueOf(100))
                .intValue();
        return new RepaymentResponse(
                l.getId(), l.getReference(), l.getWorkerName(), l.getZone(), l.getAvatarUrl(),
                principal, repaid, nz(l.getDailyDeduction()), pct, l.getStatus().name());
    }

    private static String mintReference(Long id) {
        return "L-" + Year.now().getValue() + "-" + String.format("%03d", id);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    // Best-effort link to workers(id) from the free-text name. Null when there
    // is no exact (case-insensitive) match; the DB FK allows null.
    private Long resolveWorkerId(String workerName) {
        if (workerName == null || workerName.isBlank()) return null;
        return workerRepository.findFirstByFullNameIgnoreCase(workerName.trim())
                .map(com.chaghor.chaghor.worker.Worker::getId)
                .orElse(null);
    }

    private static LoanStatus parseStatus(String v) {
        try {
            return LoanStatus.valueOf(v.trim().toUpperCase());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status");
        }
    }
}
