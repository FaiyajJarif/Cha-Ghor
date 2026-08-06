package com.chaghor.chaghor.sms;

import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

// The single entry point other modules call to "send" an SMS. It:
//   1) resolves the worker's phone,
//   2) hands the message to the active SmsSender (mock by default),
//   3) records the attempt in sms_log (mock / sent / failed).
//
// Design notes:
//  - REQUIRES_NEW: each notify runs in its OWN transaction, so a logging hiccup
//    can never roll back the payroll / withdrawal change that triggered it.
//  - Best-effort: every path is wrapped in try/catch and never throws back to
//    the caller. Notifications must not break the money flow.
//  - Idempotency: the callers are single-shot state transitions
//    (approved -> paid, pending -> paid/rejected), each guarded so it can only
//    succeed once. That guarantees at-most-one SMS per event without a separate
//    dedupe store.
@Service
public class SmsService {

    private static final Logger log = LoggerFactory.getLogger(SmsService.class);

    private final SmsSender sender;
    private final SmsLogRepository logRepo;
    private final WorkerRepository workerRepository;

    public SmsService(SmsSender sender, SmsLogRepository logRepo, WorkerRepository workerRepository) {
        this.sender = sender;
        this.logRepo = logRepo;
        this.workerRepository = workerRepository;
    }

    // Fired by PayrollService.markPaid(...) once a payslip goes approved -> paid.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyPayrollPaid(Long workerId, BigDecimal netPay) {
        String msg = "Cha Ghor: Your salary of BDT " + money(netPay) + " has been paid. Thank you.";
        dispatch(workerId, msg, SmsCategory.payroll);
    }

    // Fired by WithdrawalService.decide(...) once a request goes pending -> paid/rejected.
    // `statusLabel` is the withdrawal status name ("paid" | "rejected").
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void notifyWithdrawalStatus(Long workerId, BigDecimal amount, String statusLabel) {
        boolean paid = "paid".equalsIgnoreCase(statusLabel);
        String outcome = paid ? "approved and paid" : "rejected";
        String msg = "Cha Ghor: Your bKash withdrawal of BDT " + money(amount) + " was " + outcome + ".";
        dispatch(workerId, msg, SmsCategory.withdrawal);
    }

    // ---- internals ----
    private void dispatch(Long workerId, String message, SmsCategory category) {
        try {
            String phone = (workerId == null)
                    ? null
                    : workerRepository.findById(workerId).map(Worker::getPhone).orElse(null);

            SmsSendResult result = (phone == null || phone.isBlank())
                    ? SmsSendResult.failed("no phone on file")
                    : sender.send(phone, message);

            SmsLog row = SmsLog.builder()
                    .workerId(workerId)
                    .phone(phone)
                    .message(message)
                    .category(category)
                    .status(result.status())
                    .provider(sender.providerName())
                    .build();
            logRepo.save(row);
        } catch (Exception e) {
            // Never let a notification failure bubble into the caller's flow.
            log.warn("SMS dispatch failed (workerId={}, category={}): {}", workerId, category, e.getMessage());
        }
    }

    private static String money(BigDecimal v) {
        BigDecimal n = (v == null) ? BigDecimal.ZERO : v.setScale(0, RoundingMode.HALF_UP);
        return String.format("%,d", n.longValueExact());
    }
}
