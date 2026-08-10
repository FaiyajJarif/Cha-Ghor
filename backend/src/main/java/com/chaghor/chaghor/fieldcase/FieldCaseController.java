package com.chaghor.chaghor.fieldcase;

import jakarta.validation.Valid;
import com.chaghor.chaghor.fieldcase.dto.*;
import com.chaghor.chaghor.security.AppUserDetails;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

// REST surface for the Reports & Complaints module. Reads are open to admin +
// supervisor. Submitting a case is open to any authenticated estate user
// (worker / supervisor / admin). Replying, changing status and deleting are
// admin-only. RBAC is enforced per method with @PreAuthorize.
@RestController
@RequestMapping("/api/v1/complaints")
public class FieldCaseController {

    private final FieldCaseService service;
    private final CaseAttachmentService attachments;
    private final CaseReviewService review;
    private final BroadcastSmsService broadcastSms;

    public FieldCaseController(FieldCaseService service,
                               CaseAttachmentService attachments,
                               CaseReviewService review,
                               BroadcastSmsService broadcastSms) {
        this.service = service;
        this.attachments = attachments;
        this.review = review;
        this.broadcastSms = broadcastSms;
    }

    // ---- broadcasting to workers' phones -----------------------------------
    //
    // Three endpoints, deliberately separate, because a model must never be one
    // request away from putting words on somebody's phone:
    //
    //   GET  /sms-preview   how many people this would reach. Sends nothing.
    //   POST /sms-rewrite   shorten into Bangla. Sends nothing.
    //   POST /{id}/sms      send exactly these characters. Asks no model.
    //
    // Supervisors can do all three: a weather alert that has to wait for the
    // office is not an alert. The send is guarded against a repeat, because
    // texting forty workers twice costs money and credibility.

    @GetMapping("/sms-preview")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public Map<String, Object> smsPreview(@RequestParam(required = false) String zone) {
        return broadcastSms.preview(zone);
    }

    @PostMapping("/sms-rewrite")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public Map<String, Object> smsRewrite(@RequestBody Map<String, String> body) {
        return broadcastSms.rewrite(
                body.get("title"), body.get("body"), body.get("priority"),
                body.get("zone"), body.getOrDefault("language", "bn"));
    }

    @PostMapping("/{id}/sms")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public Map<String, Object> sendSms(@PathVariable Long id,
                                       @RequestBody Map<String, String> body) {
        return broadcastSms.send(id, body == null ? null : body.get("message"));
    }

    // AI review of one case: suggested category and priority, whether it looks
    // like a duplicate, a summary in the other language, and a reply draft.
    //
    // Every field is advisory. This endpoint changes nothing on the case, and
    // the reply draft is not sent anywhere -- it comes back as text for the
    // admin to edit.
    @PostMapping("/{id}/review")
    @PreAuthorize("hasRole('ADMIN')")
    public CaseReviewResponse aiReview(@PathVariable Long id) {
        return review.review(id);
    }

    // ---- evidence ----------------------------------------------------------

    // Upload a photo or PDF and get back the URL to store on the case.
    //
    // Two steps rather than one multipart-plus-JSON request: the file is
    // uploaded first, then the returned URL is sent as `evidenceUrl` when the
    // case is created or updated. That keeps the existing JSON endpoints
    // untouched and lets a supervisor attach evidence to a case that already
    // exists.
    //
    // Open to any authenticated user, because raising a case already is -- a
    // worker reporting a problem needs to be able to attach the photo of it.
    @PostMapping("/attachments")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file) {
        String storedName = attachments.store(file);
        return Map.of(
                "url", "/api/v1/complaints/attachments/" + storedName,
                "storedName", storedName,
                "contentType", attachments.contentTypeOf(storedName),
                "sizeBytes", file.getSize());
    }

    // Attach the uploaded evidence to a case that already exists -- the normal
    // flow when a supervisor photographs the problem after reporting it.
    @PutMapping("/{id}/evidence")
    @PreAuthorize("isAuthenticated()")
    public CaseDetailResponse attachEvidence(@PathVariable Long id,
                                             @RequestBody Map<String, String> body) {
        return service.attachEvidence(id, body == null ? null : body.get("evidenceUrl"));
    }

    // Serve an attachment. Authenticated like everything else, so evidence
    // about a named worker is not readable by anyone with the link.
    //
    // That is why the frontend fetches this through axios into a blob rather
    // than putting it in an <img src>: a plain img tag sends no Authorization
    // header and would just 401.
    @GetMapping("/attachments/{storedName}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<byte[]> download(@PathVariable String storedName) {
        byte[] data = attachments.read(storedName);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, attachments.contentTypeOf(storedName))
                // inline so images render and PDFs open, rather than always downloading
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + storedName + "\"")
                // never let a browser second-guess the type we declared
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .body(data);
    }

    // The four KPI cards.
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public CaseSummaryResponse summary() {
        return service.summary();
    }

    // List cases, optionally filtered by tab: all | complaint | report.
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<CaseListItemResponse> list(@RequestParam(required = false) String type) {
        return service.list(type);
    }

    // Full case + reply thread (right-hand detail panel).
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public CaseDetailResponse detail(@PathVariable Long id) {
        return service.detail(id);
    }

    // Submit a complaint / report. Any authenticated user may raise one; the
    // submitter identity is taken from the JWT principal, not the request body.
    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public CaseDetailResponse create(@Valid @RequestBody CreateCaseRequest req,
                                     @AuthenticationPrincipal AppUserDetails principal) {
        return service.create(req, userId(principal), name(principal), role(principal));
    }

    // Admin replies to a case (first reply moves it to IN_PROGRESS).
    @PostMapping("/{id}/replies")
    @PreAuthorize("hasRole('ADMIN')")
    public CaseDetailResponse reply(@PathVariable Long id,
                                    @Valid @RequestBody ReplyRequest req,
                                    @AuthenticationPrincipal AppUserDetails principal) {
        return service.reply(id, req, userId(principal), name(principal), role(principal));
    }

    // Admin changes status (e.g. mark RESOLVED / REJECTED).
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public CaseDetailResponse updateStatus(@PathVariable Long id, @Valid @RequestBody UpdateStatusRequest req) {
        return service.updateStatus(id, req);
    }

    // Delete a case and its replies (admin only).
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    // ---- principal helpers ----
    private static Long userId(AppUserDetails p) {
        return p == null ? null : p.getUser().getId();
    }

    private static String name(AppUserDetails p) {
        if (p == null) return "";
        String dn = p.getUser().getDisplayName();
        return (dn == null || dn.isBlank()) ? p.getUser().getUsername() : dn;
    }

    private static String role(AppUserDetails p) {
        return p == null ? "" : p.getUser().getRole().name();
    }
}
