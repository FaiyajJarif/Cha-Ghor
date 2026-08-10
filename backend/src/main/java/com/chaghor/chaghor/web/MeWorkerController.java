package com.chaghor.chaghor.web;

import com.chaghor.chaghor.web.dto.MyWages;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
// MUST be the Spring annotation. IDEs offer io.swagger.v3.oas.annotations.parameters
// .RequestBody first for this name, which compiles and then silently binds
// nothing -- the body arrives null at runtime.
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// The worker's own data. Nothing else.
//
// NOTE THE SHAPE OF EVERY ROUTE: there is no `{id}` anywhere in this file, and
// there must never be one. The worker is resolved from the JWT inside
// MeWorkerService. That is not a convenience -- it is the entire security
// boundary for this tier.
//
// Everywhere else in this application the caller is an admin or a supervisor,
// and returning whatever id was requested is correct. A worker is the first
// caller for whom that is a breach: change a digit in the URL and you are
// reading a colleague's wages, loans and grievances. Removing the parameter
// removes the attack.
//
// ADMIN and SUPERVISOR are allowed through too, but they get the same treatment
// -- their OWN worker record, if they have one. This is not a back door into
// another worker's payroll; the admin console already has proper endpoints for
// that, with proper authorisation.
@RestController
@RequestMapping("/api/v1/me/worker")
@PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR','WORKER')")
public class MeWorkerController {

    private final MeWorkerService service;
    private final LoanNoteService loanNoteService;

    public MeWorkerController(MeWorkerService service, LoanNoteService loanNoteService) {
        this.service = service;
        this.loanNoteService = loanNoteService;
    }

    // The worker's own record. Every field is a real column on `workers`;
    // `gender` is null until the office fills it in (V31) rather than guessed.
    @GetMapping
    public Map<String, Object> profile() {
        return service.profile();
    }

    // Today from the registers: attendance status, lateness, kilos so far
    // against the configured quota, field and supervisor.
    @GetMapping("/today")
    public Map<String, Object> today() {
        return service.today();
    }

    // Every line of the wage formula for the current period and the last year,
    // in the order the engine computes them. See MyWages for why nothing is
    // rolled up.
    @GetMapping("/wages")
    public MyWages wages() {
        return service.wages();
    }

    // Why this period's pay differs from the last one, reconciled to the taka.
    // Arithmetic only — no model is involved in producing these figures.
    @GetMapping("/pay-change")
    public com.chaghor.chaghor.web.dto.PayChange payChange() {
        return service.payChange();
    }

    // Outstanding loans and what is being deducted each day.
    @GetMapping("/loans")
    public Map<String, Object> loans() {
        return service.loans();
    }

    // This month so far, plus the last payslip actually paid.
    @GetMapping("/month")
    public Map<String, Object> myMonth() {
        return service.myMonth();
    }

    // Day by day: what each day earned, what each debt took, what was left.
    //
    // A READ ONLY. Nothing here posts, and the daily figures sum exactly to the
    // monthly payslip's gross − loanDeduction − advanceRecovery. See the header
    // of DailyLedgerService for why that identity is the whole design.
    @GetMapping("/daily")
    public Map<String, Object> daily() {
        return service.daily();
    }

    // What this worker may take right now, in three separate figures that must
    // never be run together on screen: money already earned (theirs), অগ্রিম
    // room (borrowed against days not yet worked), and ঋণ room.
    @GetMapping("/limits")
    public Map<String, Object> limits() {
        return service.limits();
    }

    // The worker's own profile photo. Multipart; images only.
    //
    // Stored through CaseAttachmentService, so it inherits that class's
    // magic-byte check and UUID naming rather than trusting the upload.
    @PostMapping("/photo")
    public Map<String, Object> setPhoto(
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        return service.setPhoto(file);
    }

    // Estate notices — what a supervisor has broadcast.
    //
    // REPORT cases only. A worker must never see another worker's COMPLAINT
    // here; the filter is in MeWorkerService.notices and the reasoning is
    // written there.
    @GetMapping("/notices")
    public java.util.List<Map<String, Object>> notices() {
        return service.notices();
    }

    // ---- complaints ---------------------------------------------------------

    // The worker's own cases and the four counts above them.
    @GetMapping("/complaints")
    public Map<String, Object> myCases() {
        return service.myCases();
    }

    // File one. `confidential` hides the submitter from every response and
    // screen — see CaseListItemResponse.from for where that is enforced.
    //
    // `evidenceUrl` carries a voice note the worker recorded. It is uploaded
    // separately to POST /complaints/attachments and only the returned path is
    // sent here, where MeWorkerService checks it against the exact shape that
    // endpoint produces before it is stored.
    @PostMapping("/complaints")
    public Map<String, Object> fileCase(@RequestBody Map<String, Object> body) {
        java.time.LocalDate incident = null;
        Object d = body == null ? null : body.get("incidentDate");
        if (d != null && !d.toString().isBlank()) {
            try {
                incident = java.time.LocalDate.parse(d.toString());
            } catch (Exception e) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "ঘটনার তারিখ ঠিকভাবে দিন।");
            }
        }
        java.util.UUID uuid = null;
        Object cu = body == null ? null : body.get("clientUuid");
        if (cu != null && !cu.toString().isBlank()) {
            try {
                uuid = java.util.UUID.fromString(cu.toString());
            } catch (IllegalArgumentException ignored) {
                // A malformed key just means no replay protection for this one.
                // Better than refusing a complaint over it.
            }
        }
        return service.fileCase(
                str(body, "category"), str(body, "title"), str(body, "body"),
                str(body, "priority"), incident,
                Boolean.TRUE.equals(body == null ? null : body.get("confidential")),
                uuid, str(body, "evidenceUrl"));
    }

    private static String str(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        return v == null ? null : v.toString();
    }

    // ---- borrowing ----------------------------------------------------------

    // What a given amount would cost this worker: instalment, term, new total
    // owed, and the instalment as a share of their own recent pay.
    //
    // A READ. It creates nothing. The worker sees this BEFORE deciding, which
    // is the difference between a loan button and a debt trap.
    @GetMapping("/loan-affordability")
    public com.chaghor.chaghor.web.dto.LoanAffordability affordability(
            @RequestParam java.math.BigDecimal amount) {
        return service.affordability(amount);
    }

    // The same figures, put into one Bangla sentence by the model.
    //
    // Separate from /loan-affordability on purpose: the numbers must render
    // even when ai_service is down, so the arithmetic and the wording are two
    // calls and the page only loses the sentence.
    @GetMapping("/loan-note")
    public Map<String, Object> loanNote(@RequestParam java.math.BigDecimal amount) {
        return loanNoteService.phrase(service.affordability(amount));
    }

    // File a loan request. Creates a PENDING row and nothing more — only an
    // admin can approve it, and only through LoanService.decide().
    @PostMapping("/loans")
    public Map<String, Object> requestLoan(@RequestBody Map<String, Object> body) {
        Object raw = body == null ? null : body.get("amount");
        java.math.BigDecimal amount;
        try {
            amount = raw == null ? null : new java.math.BigDecimal(raw.toString());
        } catch (NumberFormatException e) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "টাকার পরিমাণ ঠিকভাবে লিখুন।");
        }
        Object reason = body == null ? null : body.get("reason");
        return service.requestLoan(amount, reason == null ? null : reason.toString());
    }

    // ---- advances -----------------------------------------------------------

    @GetMapping("/advances")
    public java.util.List<Map<String, Object>> advances() {
        return service.advances();
    }

    // Request an advance against wages.
    //
    // NOTE THE BODY: amount and method only. There is no workerId, and that is
    // the point. /api/v1/withdrawals permits WORKER but takes the id from the
    // request, so a worker could file an advance against a colleague's wages --
    // which the office would then recover from that colleague's payslip. Here
    // the id comes from the token and the body cannot influence it.
    @PostMapping("/advances")
    public Map<String, Object> requestAdvance(@RequestBody Map<String, Object> body) {
        Object raw = body == null ? null : body.get("amount");
        java.math.BigDecimal amount;
        try {
            amount = raw == null ? null : new java.math.BigDecimal(raw.toString());
        } catch (NumberFormatException e) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "টাকার পরিমাণ ঠিকভাবে লিখুন।");
        }
        Object method = body == null ? null : body.get("method");
        // "salary" = release money already earned. "advance" (the default) =
        // borrow against days not yet worked. Different ceilings; see
        // MeWorkerService.requestAdvance.
        Object kind = body == null ? null : body.get("kind");
        return service.requestAdvance(amount, method == null ? null : method.toString(),
                kind == null ? null : kind.toString());
    }
}
