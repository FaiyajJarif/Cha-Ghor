package com.chaghor.chaghor.vision;

import com.chaghor.chaghor.audit.AuditService;
import com.chaghor.chaghor.leaf.LeafGrade;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.vision.dto.VisionReviewRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

// Recording what a human decided about a model's claim.
//
// The whole value of vision_inference is the PAIR: what the model said, and
// what the person standing at the scale said. Storing only the first is
// storing an opinion nobody checked. This service writes the second.
//
// Nothing here changes a grade on a weigh-in. The supervisor sets that on the
// leaf row as they always did; this only records whether the suggestion was
// any good, so accuracy can be measured and a real classifier trained later.
@Service
@RequiredArgsConstructor
public class VisionReviewService {

    private static final Set<String> VERDICTS = Set.of("agree", "disagree", "unsure");

    private final VisionInferenceRepository repo;
    private final UserRepository userRepository;
    private final AuditService auditService;

    @Transactional
    public VisionInference review(Long id, VisionReviewRequest req) {
        VisionInference row = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "That reading could not be found."));

        String verdict = req == null || req.verdict() == null
                ? "" : req.verdict().trim().toLowerCase();
        if (!VERDICTS.contains(verdict)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Say whether you agree, disagree, or are unsure.");
        }
        // A disagreement with no correction teaches nothing. It records that
        // the model was wrong but not what right would have been, which is
        // exactly the half that a training set needs.
        boolean corrected = req.correctedCondition() != null && !req.correctedCondition().isBlank();
        if ("disagree".equals(verdict) && !corrected && req.correctedGrade() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "If you disagree, say what it actually was — otherwise there is "
                            + "nothing to learn from.");
        }

        LeafGrade grade = null;
        if (req.correctedGrade() != null && !req.correctedGrade().isBlank()) {
            try {
                grade = LeafGrade.valueOf(req.correctedGrade().trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Grade must be A, B or C.");
            }
        }

        Long actorId = null;
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null) {
            actorId = userRepository.findByUsername(auth.getName())
                    .map(u -> u.getId()).orElse(null);
        }

        row.setSupervisorVerdict(verdict);
        row.setCorrectedCondition(corrected ? req.correctedCondition().trim() : null);
        row.setCorrectedGrade(grade);
        row.setReviewedBy(actorId);
        row.setReviewedAt(OffsetDateTime.now());
        repo.save(row);

        auditService.record("vision.review", "vision_inference", row.getId(), null,
                AuditService.details(
                        "modelSaid", row.getLabel(),
                        "verdict", verdict,
                        "correctedCondition", row.getCorrectedCondition(),
                        "correctedGrade", grade == null ? null : grade.name()));
        return row;
    }

    // Everything a human has ruled on -- the exportable training set.
    @Transactional(readOnly = true)
    public List<VisionInference> reviewed(int limit) {
        int n = Math.max(1, Math.min(limit, 2000));
        return repo.findByReviewedAtIsNotNullOrderByReviewedAtDesc(
                org.springframework.data.domain.PageRequest.of(0, n));
    }

    // How the grader is doing, counted from rows a human has checked.
    //
    // Refusals are EXCLUDED from accuracy and reported separately -- a refusal
    // is a correct outcome, not a wrong answer. Same convention as
    // ai_service/eval_leaf_grade.py, so the two numbers are comparable.
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> accuracy() {
        List<VisionInference> rows = repo.findByReviewedAtIsNotNullOrderByReviewedAtDesc(
                org.springframework.data.domain.PageRequest.of(0, 2000));
        long agree = rows.stream().filter(r -> "agree".equals(r.getSupervisorVerdict())).count();
        long disagree = rows.stream().filter(r -> "disagree".equals(r.getSupervisorVerdict())).count();
        long unsure = rows.stream().filter(r -> "unsure".equals(r.getSupervisorVerdict())).count();
        long refused = rows.stream().filter(r -> r.getRefusedReason() != null).count();
        long judged = agree + disagree;

        java.util.Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("reviewed", rows.size());
        out.put("agreed", agree);
        out.put("disagreed", disagree);
        out.put("unsure", unsure);
        out.put("refusedByModel", refused);
        out.put("accuracyPct", judged == 0 ? null
                : Math.round(agree * 1000.0 / judged) / 10.0);
        out.put("note", judged < 20
                ? "Fewer than 20 checked readings — too few to draw a conclusion from."
                : "Counted from readings a supervisor actually ruled on. Refusals are "
                        + "excluded, not scored as wrong.");
        return out;
    }
}
