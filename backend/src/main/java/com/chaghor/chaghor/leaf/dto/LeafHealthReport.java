package com.chaghor.chaghor.leaf.dto;

import java.util.List;

// The CONDITION of the leaf: disease, deficiency, scorch, damage.
//
// SEPARATE FROM THE PLUCK GRADE, and it must stay that way. This judges the
// state of the leaf; the grade judges how it was picked, and only the grade
// pays a bonus. A perfect pluck off a nitrogen-starved bush is Grade A with a
// health score of 45 -- deriving pay from health would dock a worker for the
// bush's condition.
//
// `usable` false is a REFUSAL, and a refusal is a correct outcome. It is
// recorded separately from predictions so it is never counted as a wrong
// answer -- same convention as ai_service/eval_leaf_grade.py.
//
// NEVER carries a chemical or a dosage. Treatment is not decided from a photo.
public record LeafHealthReport(
        boolean usable,
        String refusedReason,      // blurred | too_dark | no_leaf | too_far
        Integer healthScore,       // 0-100, severity x coverage
        String healthBand,         // HEALTHY | MINOR | MODERATE | SEVERE
        List<Candidate> candidates,
        List<String> observations,
        String advice,
        String provider,
        Long visionId,
        String imageUrl) {

    // One possible explanation. Ranked, never a single certain verdict, and the
    // list deliberately includes non-disease causes so yellowing from
    // under-fertilising is not reported as blight.
    public record Candidate(String condition, Double likelihood, String why) {
    }
}
