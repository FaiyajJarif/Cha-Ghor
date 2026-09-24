package com.chaghor.chaghor.vision;

// Which model produced a vision_inference row.
//
// V41 retired the native Postgres enum `vision_subject` in favour of
// VARCHAR + CHECK (the V23/V28 convention -- see CLAUDE.md §6), so this is now
// mapped as a plain string. The values stay LOWERCASE: they are the values
// already in the table and in the CHECK constraint, and renaming them would
// mean rewriting history for no gain.
//
// ============================================================================
// WHY leaf_health EXISTS
// ============================================================================
// It did not, and LeafHealthService wrote `leaf_grade` because that was the
// only leaf value available. Two different models therefore shared one label,
// and VisionReviewService.accuracy() pooled them into a single percentage that
// described neither -- mixing a grader measured at chance with a health
// detector never measured at all. See V41.
public enum VisionSubject {
    /** The pluck-grade suggester (A/B/C). Grade-A kilos carry a ৳1/kg bonus. */
    leaf_grade,

    /** The leaf health / disease scorer. */
    leaf_health,

    /** Declared by V1, never written by anything. Kept so old rows stay valid. */
    pest
}
