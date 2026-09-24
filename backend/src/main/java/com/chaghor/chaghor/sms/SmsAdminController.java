package com.chaghor.chaghor.sms;

import com.chaghor.chaghor.security.AppUserDetails;
import com.chaghor.chaghor.settings.AppSetting;
import com.chaghor.chaghor.settings.AppSettingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

// Admin control over SMS: the switches, and sending one message by hand.
//
// ============================================================================
// WHY A MANUAL SEND ENDPOINT EXISTS AT ALL
// ============================================================================
//
// Before this, every SMS the system could send was fired BY something else --
// closing a payslip, deciding a withdrawal, or a supervisor's broadcast. There
// was no way for the office to send one deliberate message and see it work.
//
// With a real SIM behind the sender that gap matters: the only way to test the
// transport was to trigger a business event, which sends to a REAL worker.
// This endpoint lets the admin type a number they own and one line of text.
//
// ADMIN ONLY, and rate-limited by ApiRateLimitFilter like everything else. It
// is a send button, so it is exactly the sort of thing that should not be
// reachable by a supervisor, let alone a worker.
@RestController
@RequestMapping("/api/v1/sms")
@PreAuthorize("hasRole('ADMIN')")
public class SmsAdminController {

    private static final Logger log = LoggerFactory.getLogger(SmsAdminController.class);

    private final SmsService smsService;
    private final SmsSender sender;
    private final SmsLogRepository logRepo;
    private final AppSettingRepository appSettingRepository;
    // The recipient picker needs worker rows, and their zone NAMES for display.
    private final com.chaghor.chaghor.worker.WorkerRepository workerRepository;
    private final com.chaghor.chaghor.zone.ZoneRepository zoneRepository;
    // Payment notices are checked against real paid withdrawals before they go
    // out -- see sendPayments below.
    private final com.chaghor.chaghor.withdrawal.WithdrawalRepository withdrawalRepository;

    public SmsAdminController(SmsService smsService, SmsSender sender,
                              SmsLogRepository logRepo,
                              AppSettingRepository appSettingRepository,
                              com.chaghor.chaghor.worker.WorkerRepository workerRepository,
                              com.chaghor.chaghor.zone.ZoneRepository zoneRepository,
                              com.chaghor.chaghor.withdrawal.WithdrawalRepository withdrawalRepository) {
        this.smsService = smsService;
        this.sender = sender;
        this.logRepo = logRepo;
        this.appSettingRepository = appSettingRepository;
        this.workerRepository = workerRepository;
        this.zoneRepository = zoneRepository;
        this.withdrawalRepository = withdrawalRepository;
    }

    // What the console needs to render the panel: both switches and which
    // transport is actually configured. The provider name is the important
    // one -- "mock" and "macmessages" look identical in the UI otherwise, and
    // the difference is whether money is being spent.
    @GetMapping("/settings")
    public Map<String, Object> settings() {
        AppSetting s = load();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("smsEnabled", s.isSmsEnabled());
        out.put("smsAutoNotify", s.isSmsAutoNotify());
        out.put("provider", sender.providerName());
        // A mock provider can never spend anything, so the console can say so
        // plainly instead of showing a scary armed state that costs nothing.
        out.put("providerIsReal", !"mock".equals(sender.providerName()));
        return out;
    }

    public record SwitchRequest(Boolean smsEnabled, Boolean smsAutoNotify) {}

    @PutMapping("/settings")
    @Transactional
    public Map<String, Object> updateSettings(
            @AuthenticationPrincipal AppUserDetails principal,
            @RequestBody SwitchRequest req) {
        AppSetting s = load();
        if (req.smsEnabled() != null) s.setSmsEnabled(req.smsEnabled());
        if (req.smsAutoNotify() != null) s.setSmsAutoNotify(req.smsAutoNotify());

        // Turning the master switch OFF also disarms automatic notices. Leaving
        // auto-notify true while the master is false is a state that reads as
        // "armed" in the database and would surprise whoever turns the master
        // back on later.
        if (!s.isSmsEnabled()) s.setSmsAutoNotify(false);

        s.setUpdatedBy(principal == null ? null : principal.getUser().getId());
        s.setUpdatedAt(OffsetDateTime.now());
        appSettingRepository.save(s);

        // Logged at WARN because arming a real transport is a money decision and
        // should be findable in the console afterwards.
        log.warn("[sms] switches changed by {}: enabled={} autoNotify={} provider={}",
                principal == null ? "?" : principal.getUsername(),
                s.isSmsEnabled(), s.isSmsAutoNotify(), sender.providerName());
        return settings();
    }

    public record TestSendRequest(String phone, String message) {}

    // Send ONE message, to a number the admin types, right now.
    //
    // Deliberately NOT gated on smsAutoNotify -- this is the opposite of an
    // automatic notice, it is a person pressing a button. It IS gated on the
    // master switch, because off has to mean off everywhere or it is not a kill
    // switch.
    @PostMapping("/send")
    public Map<String, Object> send(@RequestBody TestSendRequest req) {
        String phone = req.phone() == null ? "" : req.phone().trim();
        String message = req.message() == null ? "" : req.message().trim();

        if (phone.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Enter the phone number to send to.");
        }
        if (message.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Type the message you want to send.");
        }
        // Long enough to be a mistake rather than a message. Carriers split
        // above 160 (70 for Bangla), so this is several messages' worth of
        // credit per recipient.
        if (message.length() > 480) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That message is very long — keep it under 480 characters.");
        }
        if (!smsService.smsEnabled()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "SMS sending is switched off. Turn it on in Settings first.");
        }

        SmsSendResult result;
        try {
            result = sender.send(phone, message);
        } catch (Exception e) {
            result = SmsSendResult.failed(e.getMessage());
        }

        // Logged like any other message. A manual send that left no row would
        // make the delivery log an incomplete record of what this SIM sent.
        logRepo.save(SmsLog.builder()
                .phone(phone)
                .message(message)
                .category(SmsCategory.alert)
                .status(result.status())
                .provider(sender.providerName())
                .build());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", result.status().name());
        out.put("provider", sender.providerName());
        // The detail is returned HERE even though sms_log has no column for it,
        // so the admin sees the actual reason on the screen where they pressed
        // the button. Everywhere else it is only in the server console.
        out.put("detail", result.detail());
        return out;
    }

    // ---- pick recipients, then send to the ones chosen ----------------------

    // Every worker who could receive an SMS: active, and with a phone on file.
    //
    // A worker with NO PHONE is excluded rather than listed and skipped. A
    // picker that offers rows which silently cannot be texted makes the count
    // on the confirm screen a lie.
    @GetMapping("/recipients")
    public java.util.List<Map<String, Object>> recipients() {
        Map<Long, String> zones = new java.util.HashMap<>();
        zoneRepository.findAll().forEach(z -> zones.put(z.getId(), z.getName()));

        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (var w : workerRepository.findAll()) {
            if (!"active".equalsIgnoreCase(String.valueOf(w.getStatus()))) continue;
            if (w.getPhone() == null || w.getPhone().isBlank()) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("workerId", w.getId());
            m.put("name", w.getFullName());
            m.put("nameBn", w.getNameBn());
            m.put("code", "CG" + String.format("%03d", w.getId()));
            m.put("zone", w.getZoneId() == null ? null : zones.get(w.getZoneId()));
            m.put("phone", w.getPhone());
            out.add(m);
        }
        return out;
    }

    public record BulkSendRequest(java.util.List<Long> workerIds, String category, String message) {}

    // Send ONE message to the workers the admin ticked.
    //
    // ========================================================================
    // WHY THE RECIPIENTS ARE IDs, NOT PHONE NUMBERS
    // ========================================================================
    //
    // The browser sends worker ids; the phone number is looked up here, on the
    // server, from the worker row. A client that could post arbitrary numbers
    // would be an open SMS relay behind an admin login -- and the admin's own
    // browser is not a trustworthy source for "who is allowed to be texted".
    //
    // {name} and {code} are substituted PER WORKER. Amounts deliberately are
    // not: a payslip net differs for every person, and a bulk message carrying
    // one number would be wrong for almost everyone receiving it. If you need
    // to tell someone their pay, that is the automatic notice, not this.
    @PostMapping("/send-bulk")
    public Map<String, Object> sendBulk(@RequestBody BulkSendRequest req) {
        java.util.List<Long> ids = req.workerIds() == null ? java.util.List.of() : req.workerIds();
        String message = req.message() == null ? "" : req.message().trim();

        if (ids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Choose at least one person to send to.");
        }
        if (message.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Type the message you want to send.");
        }
        if (message.length() > 480) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That message is very long — keep it under 480 characters.");
        }
        if (!smsService.smsEnabled()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "SMS sending is switched off. Turn it on in Settings first.");
        }

        SmsCategory category;
        try {
            category = SmsCategory.valueOf(
                    req.category() == null ? "alert" : req.category().toLowerCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown message type: " + req.category());
        }

        int sent = 0, failed = 0, skipped = 0;
        for (Long id : ids) {
            var w = workerRepository.findById(id).orElse(null);
            // Silently dropping an unknown or phoneless id would make the
            // summary disagree with what the admin selected.
            if (w == null || w.getPhone() == null || w.getPhone().isBlank()) {
                skipped++;
                continue;
            }
            String personal = message
                    .replace("{name}", w.getFullName() == null ? "" : w.getFullName())
                    .replace("{code}", "CG" + String.format("%03d", w.getId()));

            SmsSendResult result;
            try {
                result = sender.send(w.getPhone(), personal);
            } catch (Exception e) {
                result = SmsSendResult.failed(e.getMessage());
            }
            logRepo.save(SmsLog.builder()
                    .workerId(w.getId())
                    .phone(w.getPhone())
                    .message(personal)
                    .category(category)
                    .status(result.status())
                    .provider(sender.providerName())
                    .build());
            if (result.status() == SmsStatus.failed) failed++; else sent++;
        }

        log.warn("[sms] bulk send by admin: category={} selected={} sent={} failed={} skipped={}",
                category, ids.size(), sent, failed, skipped);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("selected", ids.size());
        out.put("sent", sent);
        out.put("failed", failed);
        out.put("skipped", skipped);
        out.put("provider", sender.providerName());
        return out;
    }

    public record PaymentLine(Long workerId, java.math.BigDecimal amount) {}
    public record PaymentSendRequest(java.util.List<PaymentLine> lines) {}

    // Tell workers their payment has been sent, each with their OWN figure.
    //
    // ========================================================================
    // WHY THIS IS NOT send-bulk
    // ========================================================================
    //
    // send-bulk deliberately refuses to carry an amount: it sends one identical
    // message, and a single figure would be wrong for almost everyone getting
    // it. That restriction is right for a broadcast and useless for a payout,
    // where the amount is the only part the worker actually wants.
    //
    // So this endpoint takes one line per worker and composes each message
    // separately. The wording matches SmsService.notifyWithdrawalStatus exactly,
    // so a worker who gets the automatic notice and a worker who gets this one
    // cannot tell them apart -- two different sentences for the same event is
    // how a worker starts wondering which is true.
    //
    // ========================================================================
    // THE AMOUNT IS CHECKED AGAINST A REAL PAID WITHDRAWAL
    // ========================================================================
    //
    // The figure arrives from an uploaded CSV, which is a text file an admin
    // can edit. No money moves here, so a wrong number cannot misdirect a
    // payment -- but it can tell a worker "240 taka was sent" when it was not,
    // and on the one subject where this system is trying to be trustworthy that
    // is the worst thing it could do.
    //
    // So every line must match a withdrawal that is ALREADY `paid`, for that
    // worker, for that exact amount. If it does not, the row is skipped with a
    // reason and no text is sent. The estate can only say money moved where
    // there is a row proving it moved -- the same rule the ledger runs on.
    @PostMapping("/send-payments")
    @Transactional(readOnly = true)
    public Map<String, Object> sendPayments(@RequestBody PaymentSendRequest req) {
        java.util.List<PaymentLine> lines =
                req.lines() == null ? java.util.List.of() : req.lines();

        if (lines.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Choose at least one worker to notify.");
        }
        // Same gate as every other manual send. Checked BEFORE any work so the
        // admin gets one clear sentence instead of a summary saying 0 sent.
        if (!smsService.smsEnabled()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "SMS sending is switched off. Turn it on in Settings first.");
        }

        // Every paid withdrawal, once, rather than a query per line.
        java.util.List<com.chaghor.chaghor.withdrawal.WithdrawalRequest> paid =
                withdrawalRepository.findByStatusOrderByRequestedAtDesc(
                        com.chaghor.chaghor.withdrawal.WithdrawalStatus.paid);

        int sent = 0, failed = 0;
        java.util.List<Map<String, Object>> skipped = new java.util.ArrayList<>();

        for (PaymentLine line : lines) {
            Long id = line.workerId();
            java.math.BigDecimal amount = line.amount();
            if (id == null || amount == null) {
                skipped.add(skipRow(id, "Missing worker or amount."));
                continue;
            }
            java.math.BigDecimal want =
                    amount.setScale(2, java.math.RoundingMode.HALF_UP);

            var w = workerRepository.findById(id).orElse(null);
            if (w == null || w.getPhone() == null || w.getPhone().isBlank()) {
                skipped.add(skipRow(id, "No phone number on file."));
                continue;
            }

            boolean proven = paid.stream().anyMatch(p ->
                    id.equals(p.getWorkerId())
                            && p.getAmount() != null
                            && p.getAmount().setScale(2, java.math.RoundingMode.HALF_UP)
                                 .compareTo(want) == 0);
            if (!proven) {
                skipped.add(skipRow(id, "No paid withdrawal of " + want.toPlainString()
                        + " for this worker. Refusing to say money was sent."));
                continue;
            }

            // Word for word the automatic notice. money() is private to
            // SmsService, so the formatting is repeated here -- grouped
            // thousands, no decimals, Western digits so it can be compared
            // against the bKash confirmation at a glance.
            String msg = "চা ঘর: আপনার বিকাশ নম্বরে "
                    + String.format("%,d", want.setScale(0, java.math.RoundingMode.HALF_UP)
                            .longValueExact())
                    + " টাকা পাঠানো হয়েছে। ধন্যবাদ।";

            SmsSendResult result;
            try {
                result = sender.send(w.getPhone(), msg);
            } catch (Exception e) {
                result = SmsSendResult.failed(e.getMessage());
            }
            logRepo.save(SmsLog.builder()
                    .workerId(w.getId())
                    .phone(w.getPhone())
                    .message(msg)
                    .category(SmsCategory.withdrawal)
                    .status(result.status())
                    .provider(sender.providerName())
                    .build());
            if (result.status() == SmsStatus.failed) failed++; else sent++;
        }

        log.warn("[sms] payment notices by admin: lines={} sent={} failed={} skipped={}",
                lines.size(), sent, failed, skipped.size());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("selected", lines.size());
        out.put("sent", sent);
        out.put("failed", failed);
        out.put("skipped", skipped);
        out.put("provider", sender.providerName());
        return out;
    }

    private static Map<String, Object> skipRow(Long workerId, String reason) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("workerId", workerId);
        m.put("reason", reason);
        return m;
    }

    private AppSetting load() {
        return appSettingRepository.findById(1L).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Estate settings row is missing."));
    }
}
