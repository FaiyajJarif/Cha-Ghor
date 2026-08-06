package com.chaghor.chaghor.fieldcase;

import com.chaghor.chaghor.chatbot.ChatbotService;
import com.chaghor.chaghor.fieldcase.dto.CaseReviewResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

// AI review of a complaint / field report: triage, duplicate check, a summary
// in the other language, and a reply draft.
//
// The split follows the rest of this codebase: WE choose which cases the model
// is even allowed to consider a duplicate of, and WE re-check the id it picks.
// The model reads text and forms an opinion; it never decides what exists.
//
// Nothing here mutates the case. The category and priority are suggestions the
// admin applies by hand, and the reply draft is text in a box -- it is never
// sent. That matters more than usual here: the output is a message to a worker
// about their own complaint.
@Service
public class CaseReviewService {

    // How many other cases the model may weigh as possible duplicates. Kept
    // small: a longer list costs tokens and makes a spurious match likelier.
    private static final int MAX_CANDIDATES = 20;

    private final FieldCaseRepository cases;
    private final ChatbotService chatbotService;

    public CaseReviewService(FieldCaseRepository cases, ChatbotService chatbotService) {
        this.cases = cases;
        this.chatbotService = chatbotService;
    }

    @Transactional(readOnly = true)
    public CaseReviewResponse review(Long id) {
        FieldCase c = cases.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "That case could not be found."));

        List<FieldCase> candidates = candidatesFor(c);
        Map<Long, FieldCase> byId = new LinkedHashMap<>();
        List<Map<String, Object>> candidatePayload = new ArrayList<>();
        for (FieldCase o : candidates) {
            byId.put(o.getId(), o);
            candidatePayload.add(Map.of(
                    "id", o.getId(),
                    "title", nz(o.getTitle()),
                    "body", trimTo(nz(o.getBody()), 400),
                    "zone", nz(o.getZone()),
                    "category", nz(o.getCategory()),
                    "createdAt", o.getCreatedAt() == null ? "" : o.getCreatedAt().toString()));
        }

        Map<String, Object> casePayload = new LinkedHashMap<>();
        casePayload.put("id", c.getId());
        casePayload.put("title", nz(c.getTitle()));
        casePayload.put("body", trimTo(nz(c.getBody()), 2000));
        casePayload.put("zone", nz(c.getZone()));
        casePayload.put("workerCode", nz(c.getWorkerCode()));
        casePayload.put("submitterRole", nz(c.getSubmitterRole()));
        casePayload.put("currentCategory", nz(c.getCategory()));
        casePayload.put("currentPriority", c.getPriority() == null ? "" : c.getPriority().name());
        casePayload.put("hasEvidence", c.getEvidenceUrl() != null);

        Map<String, Object> res;
        try {
            res = chatbotService.reviewCase(casePayload, candidatePayload, knownCategories());
        } catch (ResponseStatusException ex) {
            // The AI being down must not block handling a complaint.
            return CaseReviewResponse.unavailable(id,
                    "The AI reviewer is not available right now. This case has not been reviewed.");
        }

        // Re-check the duplicate against our own data. ai_service already
        // dropped anything outside the candidate list; this confirms the row
        // still exists and takes the title from the database, not the model.
        Long dup = longOf(res.get("duplicate_of"));
        String dupTitle = null;
        if (dup != null && byId.containsKey(dup)) {
            dupTitle = nz(byId.get(dup).getTitle());
        } else {
            dup = null;
        }

        return new CaseReviewResponse(
                id, true, null,
                trimTo(str(res.get("category")), 60),
                priorityOf(str(res.get("priority"))),
                trimTo(str(res.get("priority_reason")), 600),
                dup,
                dupTitle,
                dup == null ? null : str(res.get("duplicate_confidence")),
                dup == null ? null : trimTo(str(res.get("duplicate_reason")), 600),
                str(res.get("language")),
                trimTo(str(res.get("summary_other_language")), 600),
                trimTo(str(res.get("reply_draft")), 600),
                Boolean.TRUE.equals(res.get("looks_like_spam")),
                candidatePayload.size(),
                str(res.get("provider")));
    }

    // Which cases could plausibly be the same problem: still open, not this
    // one, and sharing a zone or a worker. Narrowing here rather than sending
    // everything is what keeps a spurious match unlikely -- two unrelated wage
    // disputes in different zones never get compared in the first place.
    private List<FieldCase> candidatesFor(FieldCase c) {
        List<FieldCase> out = new ArrayList<>();
        for (FieldCase o : cases.findAllByOrderByCreatedAtDesc()) {
            if (o.getId().equals(c.getId())) {
                continue;
            }
            if (o.getStatus() == CaseStatus.RESOLVED) {
                continue;
            }
            boolean sameZone = c.getZone() != null && !c.getZone().isBlank()
                    && c.getZone().equalsIgnoreCase(o.getZone());
            boolean sameWorker = c.getWorkerCode() != null && !c.getWorkerCode().isBlank()
                    && c.getWorkerCode().equalsIgnoreCase(o.getWorkerCode());
            boolean recent = o.getCreatedAt() != null
                    && o.getCreatedAt().isAfter(OffsetDateTime.now().minusDays(30));
            if (sameZone || sameWorker || recent) {
                out.add(o);
            }
            if (out.size() >= MAX_CANDIDATES) {
                break;
            }
        }
        return out;
    }

    // The categories already in use, so the model reuses one instead of
    // inventing a synonym and fragmenting the reporting.
    private List<String> knownCategories() {
        Set<String> seen = new LinkedHashSet<>();
        for (FieldCase o : cases.findAllByOrderByCreatedAtDesc()) {
            String cat = o.getCategory();
            if (cat != null && !cat.isBlank()) {
                seen.add(cat.trim());
            }
            if (seen.size() >= 30) {
                break;
            }
        }
        return new ArrayList<>(seen);
    }

    // ---- helpers ----
    private static String priorityOf(String v) {
        String s = v == null ? "" : v.trim().toUpperCase();
        return switch (s) {
            case "LOW", "MEDIUM", "HIGH" -> s;
            default -> "MEDIUM";
        };
    }

    private static Long longOf(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return o == null ? null : Long.valueOf(o.toString().trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String trimTo(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
