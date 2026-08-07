package com.chaghor.chaghor.fieldcase;

import com.chaghor.chaghor.fieldcase.dto.*;
import com.chaghor.chaghor.notification.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

// Business logic for the Reports & Complaints module: the KPI rollup, listing
// and detail, submitting cases, admin replies, and status changes. The first
// admin reply stamps firstResponseAt (drives the avg-response KPI) and flips an
// OPEN case to IN_PROGRESS. Marking RESOLVED stamps resolvedAt.
@Service
public class FieldCaseService {

    private final FieldCaseRepository cases;
    private final CaseReplyRepository replies;
    // Live push. A case raised in the field has to reach the other supervisors
    // and the admin without anyone reloading a page -- that is the whole point
    // of the Broadcast board.
    private final NotificationService notifications;

    public FieldCaseService(FieldCaseRepository cases, CaseReplyRepository replies,
                            NotificationService notifications) {
        this.cases = cases;
        this.replies = replies;
        this.notifications = notifications;
    }

    // Push an event to every open console. Never let a failed notification fail
    // the write that caused it: the case is already saved and committed as far
    // as the caller is concerned, and a dropped WebSocket frame must not turn a
    // successful report into an error on a supervisor's phone.
    private void push(String title, String body, String kind, Long refId) {
        try {
            notifications.send(title, body, kind, refId);
        } catch (Exception ignored) {
            // best-effort by design
        }
    }

    public CaseSummaryResponse summary() {
        List<FieldCase> all = cases.findAll();
        long total = all.size();
        long resolved = all.stream().filter(c -> c.getStatus() == CaseStatus.RESOLVED).count();
        long active = all.stream()
                .filter(c -> c.getStatus() == CaseStatus.OPEN || c.getStatus() == CaseStatus.IN_PROGRESS)
                .count();

        // Average hours from submission to first response, over cases that have
        // actually been responded to.
        double avgHours = all.stream()
                .filter(c -> c.getFirstResponseAt() != null && c.getCreatedAt() != null)
                .mapToDouble(c -> Duration.between(c.getCreatedAt(), c.getFirstResponseAt()).toMinutes() / 60.0)
                .average()
                .orElse(0.0);
        avgHours = Math.round(avgHours * 10.0) / 10.0;

        double resolutionRate = total == 0 ? 0.0 : Math.round(resolved * 1000.0 / total) / 10.0;

        // Compliance: at-risk when any active case has breached its priority
        // response window; otherwise stable.
        OffsetDateTime now = OffsetDateTime.now();
        boolean breach = all.stream()
                .filter(c -> c.getStatus() == CaseStatus.OPEN || c.getStatus() == CaseStatus.IN_PROGRESS)
                .anyMatch(c -> {
                    if (c.getCreatedAt() == null) return false;
                    long hours = Duration.between(c.getCreatedAt(), now).toHours();
                    return switch (c.getPriority()) {
                        case URGENT -> hours > 8;
                        case HIGH -> hours > 24;
                        case MEDIUM -> hours > 72;
                        case LOW -> hours > 168;
                    };
                });
        String compliance = breach ? "at-risk" : "stable";

        return new CaseSummaryResponse(avgHours, active, resolutionRate, compliance, total, resolved);
    }

    public List<CaseListItemResponse> list(String type) {
        List<FieldCase> rows;
        if (type == null || type.isBlank() || type.equalsIgnoreCase("all")) {
            rows = cases.findAllByOrderByCreatedAtDesc();
        } else {
            rows = cases.findByCaseTypeOrderByCreatedAtDesc(parseType(type));
        }
        return rows.stream().map(CaseListItemResponse::from).toList();
    }

    public CaseDetailResponse detail(Long id) {
        FieldCase c = getOr404(id);
        List<CaseReplyResponse> thread = replies.findByCaseIdOrderByCreatedAtAsc(id)
                .stream().map(CaseReplyResponse::from).toList();
        return CaseDetailResponse.from(c, thread);
    }

    public CaseDetailResponse create(CreateCaseRequest req, Long userId, String name, String role) {
        if (req == null || req.title() == null || req.title().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title is required");
        }
        FieldCase c = FieldCase.builder()
                .caseType(parseType(req.caseType()))
                .category(nz(req.category()))
                .title(req.title().trim())
                .body(nz(req.body()))
                .submitterName(name == null ? "" : name)
                .submitterRole(role == null ? "" : role)
                .submittedBy(userId)
                .workerCode(emptyToNull(req.workerCode()))
                .zone(emptyToNull(req.zone()))
                .priority(parsePriority(req.priority()))
                .status(CaseStatus.OPEN)
                .evidenceUrl(emptyToNull(req.evidenceUrl()))
                .build();
        FieldCase saved = cases.save(c);
        push(saved.getTitle(),
                (saved.getSubmitterName() == null ? "" : saved.getSubmitterName())
                        + (saved.getZone() == null ? "" : " · " + saved.getZone()),
                "case.created", saved.getId());
        return detail(saved.getId());
    }

    public CaseDetailResponse reply(Long id, ReplyRequest req, Long userId, String name, String role) {
        if (req == null || req.body() == null || req.body().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reply body is required");
        }
        FieldCase c = getOr404(id);
        CaseReply r = CaseReply.builder()
                .caseId(id)
                .authorName(name == null ? "" : name)
                .authorRole(role == null ? "" : role)
                .authorId(userId)
                .body(req.body().trim())
                .build();
        replies.save(r);

        // First response stamps the KPI clock and moves the case forward.
        if (c.getFirstResponseAt() == null) {
            c.setFirstResponseAt(OffsetDateTime.now());
        }
        if (c.getStatus() == CaseStatus.OPEN) {
            c.setStatus(CaseStatus.IN_PROGRESS);
        }
        if (c.getAssignedTo() == null) {
            c.setAssignedTo(userId);
        }
        cases.save(c);
        push("Reply on: " + c.getTitle(),
                (name == null ? "" : name) + " responded",
                "case.replied", id);
        return detail(id);
    }

    public CaseDetailResponse updateStatus(Long id, UpdateStatusRequest req) {
        if (req == null || req.status() == null || req.status().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status is required");
        }
        FieldCase c = getOr404(id);
        CaseStatus next = parseStatus(req.status());
        c.setStatus(next);
        if (next == CaseStatus.RESOLVED && c.getResolvedAt() == null) {
            c.setResolvedAt(OffsetDateTime.now());
        }
        if (next != CaseStatus.RESOLVED) {
            c.setResolvedAt(null);
        }
        cases.save(c);
        push(c.getTitle(),
                "Marked " + next.name().replace("_", " ").toLowerCase(),
                "case.status", id);
        return detail(id);
    }

    // Attach (or replace) the evidence on a case that already exists. The URL
    // comes from POST /complaints/attachments, which has already validated the
    // file's type and magic bytes -- nothing here trusts a caller-supplied path.
    //
    // Replacing leaves the previous file on disk. That is deliberate for now:
    // an evidence file that quietly disappears is worse than one that lingers,
    // and a sweep of orphaned files is a separate job.
    public CaseDetailResponse attachEvidence(Long id, String evidenceUrl) {
        FieldCase c = cases.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That case could not be found."));
        c.setEvidenceUrl(emptyToNull(evidenceUrl));
        cases.save(c);
        return detail(id);
    }

    public void delete(Long id) {
        FieldCase c = getOr404(id);
        replies.deleteByCaseId(c.getId());
        cases.deleteById(c.getId());
    }

    // ---- helpers ----
    private FieldCase getOr404(Long id) {
        return cases.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found"));
    }

    private static CaseType parseType(String v) {
        if (v == null || v.isBlank()) return CaseType.COMPLAINT;
        try {
            return CaseType.valueOf(v.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid case type: " + v);
        }
    }

    private static CasePriority parsePriority(String v) {
        if (v == null || v.isBlank()) return CasePriority.MEDIUM;
        try {
            return CasePriority.valueOf(v.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid priority: " + v);
        }
    }

    private static CaseStatus parseStatus(String v) {
        try {
            return CaseStatus.valueOf(v.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + v);
        }
    }

    private static String nz(String v) {
        return v == null ? "" : v;
    }

    private static String emptyToNull(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }
}
