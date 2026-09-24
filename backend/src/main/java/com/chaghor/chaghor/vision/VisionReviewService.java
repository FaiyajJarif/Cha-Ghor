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

    // How each model is doing, counted from rows a human has checked.
    //
    // ========================================================================
    // ONE FIGURE PER MODEL. POOLING THEM DESCRIBED NEITHER.
    // ========================================================================
    //
    // This used to count EVERY reviewed row and return a single accuracyPct.
    // Two different models write to this table -- the pluck GRADER and the leaf
    // HEALTH detector -- and until V41 both stored subject_type = 'leaf_grade',
    // so there was not even a way to tell them apart.
    //
    // The pooled number was actively misleading: the grader is measured at
    // 56.7% against a 51% always-guess-A baseline, p = 0.15, i.e.
    // indistinguishable from guessing (LEAF_GRADING_ACCURACY.md, n = 97), while
    // the health detector has never been measured at all. Averaging a known
    // chance-level model with an unmeasured one produces a number that is
    // evidence for nothing.
    //
    // Refusals are EXCLUDED from the percentage and reported separately -- a
    // refusal is a correct outcome, not a wrong answer. Same convention as
    // ai_service/eval_leaf_grade.py, so the figures stay comparable with it.
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> accuracy() {
        java.util.Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("leafGrade", forSubject(VisionSubject.leaf_grade));
        out.put("leafHealth", forSubject(VisionSubject.leaf_health));
        // No estate-wide roll-up on purpose. Anyone reading one number would be
        // reading the average of two unrelated classifiers.
        out.put("note",
                "Reported per model. There is deliberately no combined figure: "
                        + "the grader and the health detector are different models "
                        + "and one number for both would describe neither.");
        return out;
    }

    // One model's record. Counted in the database rather than by loading every
    // row and filtering in memory -- a shared 2000-row page would let a busy
    // model starve a quiet one out of its own statistics.
    private java.util.Map<String, Object> forSubject(VisionSubject subject) {
        List<VisionInference> rows = repo
                .findBySubjectTypeAndReviewedAtIsNotNullOrderByReviewedAtDesc(
                        subject, org.springframework.data.domain.PageRequest.of(0, 2000));

        long agree = rows.stream().filter(r -> "agree".equals(r.getSupervisorVerdict())).count();
        long disagree = rows.stream().filter(r -> "disagree".equals(r.getSupervisorVerdict())).count();
        long unsure = rows.stream().filter(r -> "unsure".equals(r.getSupervisorVerdict())).count();
        long refused = rows.stream().filter(r -> r.getRefusedReason() != null).count();
        long judged = agree + disagree;

        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("model", subject.name());
        m.put("reviewed", rows.size());
        m.put("agreed", agree);
        m.put("disagreed", disagree);
        m.put("unsure", unsure);
        m.put("refusedByModel", refused);
        m.put("accuracyPct", judged == 0 ? null
                : Math.round(agree * 1000.0 / judged) / 10.0);
        // The sample size is part of the claim, not a footnote -- CLAUDE.md §9.5.
        m.put("sample", judged);
        m.put("enough", judged >= 20);
        m.put("note", judged == 0
                ? "No checked readings yet, so there is no measurement — not a score of zero."
                : judged < 20
                        ? "Only " + judged + " checked readings. Too few to draw a conclusion from."
                        : "From " + judged + " readings a supervisor actually ruled on. "
                                + "Refusals are excluded, not scored as wrong.");
        return m;
    }
}
