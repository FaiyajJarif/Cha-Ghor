package com.chaghor.chaghor.sms;

import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.chaghor.chaghor.zone.ZoneRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    private final com.chaghor.chaghor.user.UserRepository userRepository;
    // Needed to turn a broadcast's field NAME into the zone id workers carry.
    private final ZoneRepository zoneRepository;

    // EXPLICIT CONSTRUCTOR, no Lombok on this class. So a new final field is
    // two edits, not one: the declaration AND a parameter plus assignment here.
    // Adding only the field compiles nowhere -- "variable userRepository might
    // not have been initialized" -- which is exactly what adding
    // userRepository for the notification preferences did.
    public SmsService(SmsSender sender, SmsLogRepository logRepo,
                      WorkerRepository workerRepository,
                      com.chaghor.chaghor.user.UserRepository userRepository,
                      ZoneRepository zoneRepository) {
        this.sender = sender;
        this.logRepo = logRepo;
        this.workerRepository = workerRepository;
        this.userRepository = userRepository;
        this.zoneRepository = zoneRepository;
    }

    // Fired by PayrollService.markPaid(...) once a payslip goes approved -> paid.
    //
    // THE WORD "পরিশোধ" (paid) IS GONE ON PURPOSE.
    //
    // This used to say "your salary of X has been paid" and, since the estate
    // moved to daily settlement, that is not what happened. Wages reach the
    // worker daily as they withdraw; closing the payslip only finalises the
    // month's statement. A worker who reads "paid" and then finds nothing new
    // in their bKash has been told a lie by the system, about the one subject
    // where trust is the entire product.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    // IN BANGLA, because the recipient is a worker and the entire worker
    // console is Bangla. The amount stays in Western digits deliberately: a
    // bKash confirmation SMS shows Western digits, and the two need to be
    // comparable at a glance.
    public void notifyPayrollClosed(Long workerId, BigDecimal netPay) {
        String msg = "চা ঘর: এই মাসের বেতনের হিসাব চূড়ান্ত হয়েছে। মোট "
                + money(netPay) + " টাকা। ধন্যবাদ।";
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

    // ---- field alerts (broadcasts) -----------------------------------------

    // Who a broadcast would reach: active workers who have a phone number, in
    // the named field if one was given, estate-wide otherwise.
    //
    // A worker with no phone on file is EXCLUDED rather than counted and
    // failed. The number shown on the confirm screen has to mean "this many
    // people will get a text", not "this many rows will appear in the log".
    @Transactional(readOnly = true)
    public List<Worker> alertRecipients(String zoneName) {
        Long zoneId = null;
        if (zoneName != null && !zoneName.isBlank()) {
            zoneId = zoneRepository.findAll().stream()
                    .filter(z -> z.getArchivedAt() == null)
                    .filter(z -> zoneName.trim().equalsIgnoreCase(z.getName())
                            || zoneName.trim().equalsIgnoreCase(z.getCode()))
                    .map(z -> z.getId())
                    .findFirst()
                    .orElse(null);
            // A zone name that matches nothing must NOT silently fall through
            // to "everyone". Texting the whole estate because of a typo is the
            // exact mistake the confirm step exists to prevent.
            if (zoneId == null) return List.of();
        }
        final Long zid = zoneId;
        return workerRepository.findAll().stream()
                .filter(w -> "active".equalsIgnoreCase(String.valueOf(w.getStatus())))
                .filter(w -> w.getPhone() != null && !w.getPhone().isBlank())
                .filter(w -> zid == null || zid.equals(w.getZoneId()))
                .toList();
    }

    // Send a field alert to those recipients and record every attempt.
    //
    // NOT best-effort like the payroll notices. Those ride along with a money
    // transition that must not be rolled back by a texting problem; this IS the
    // action the supervisor asked for, so if it cannot happen they need to be
    // told rather than shown a success screen.
    //
    // Guarded on caseId: a broadcast that has already been sent is refused.
    // The other callers get idempotency free from their single-shot state
    // transitions (approved -> paid). A broadcast has no such transition, so a
    // double-tap on Send during a storm would otherwise text everyone twice.
    @Transactional
    public Map<String, Object> broadcastAlert(Long caseId, String zoneName, String message) {
        if (caseId == null) {
            throw new IllegalArgumentException("A broadcast must be attached to a case.");
        }
        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException("There is no message to send.");
        }
        if (logRepo.countByCaseId(caseId) > 0) {
            throw new IllegalStateException("This broadcast has already been sent as SMS.");
        }

        List<Worker> recipients = alertRecipients(zoneName);
        int sent = 0;
        int failed = 0;

        for (Worker w : recipients) {
            SmsSendResult result;
            try {
                result = sender.send(w.getPhone(), message);
            } catch (Exception e) {
                result = SmsSendResult.failed(e.getMessage());
            }
            // One log row per recipient, whatever happened. A failure that
            // leaves no trace is indistinguishable from a message nobody sent.
            logRepo.save(SmsLog.builder()
                    .workerId(w.getId())
                    .phone(w.getPhone())
                    .message(message)
                    .category(SmsCategory.alert)
                    .status(result.status())
                    .provider(sender.providerName())
                    .caseId(caseId)
                    .build());
            if (result.status() == SmsStatus.failed) failed++;
            else sent++;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("attempted", recipients.size());
        out.put("sent", sent);
        out.put("failed", failed);
        out.put("provider", sender.providerName());
        return out;
    }

    // ---- internals ----
    // Does this worker still want SMS of this kind?
    //
    // THESE TOGGLES WERE DEAD. V3 added notify_broadcast / notify_attendance /
    // notify_payroll, SettingsController wrote them, UserResponse returned
    // them -- and nothing on the estate ever READ them. Every SMS went out
    // regardless. Putting a switch on the worker's settings screen without
    // this would have been a control that visibly moved and did nothing, on
    // the one screen whose entire purpose is giving them control.
    //
    // Default TRUE, and true whenever the answer is unknown: an unlinked
    // account or a missing user must not silently stop a wage notification.
    // Silence is the failure mode that matters here, not an extra message.
    private boolean wantsSms(Long workerId, SmsCategory category) {
        if (workerId == null) return true;
        try {
            Long userId = workerRepository.findById(workerId)
                    .map(com.chaghor.chaghor.worker.Worker::getUserId).orElse(null);
            if (userId == null) return true;
            var user = userRepository.findById(userId).orElse(null);
            if (user == null) return true;
            return switch (category) {
                case payroll -> user.isNotifyPayroll();
                // A loan or withdrawal decision is money moving on this
                // worker's own request. It rides the payroll preference rather
                // than getting a switch of its own -- there is no sensible
                // reading of "tell me about my pay, but not about my advance".
                case loan, withdrawal -> user.isNotifyPayroll();
                case alert -> user.isNotifyBroadcast();
            };
        } catch (Exception e) {
            // Never let a preference lookup swallow a notification.
            return true;
        }
    }

    private void dispatch(Long workerId, String message, SmsCategory category) {
        if (!wantsSms(workerId, category)) {
            return;
        }
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
