package com.chaghor.chaghor.leaf.dto;

import java.math.BigDecimal;
import java.util.List;

// What the model thinks it saw in a photograph of plucked leaf.
//
// A SUGGESTION, never a decision, and the UI must present it that way. Grade A
// carries a per-kilo bonus, so accepting a model's read of a phone photo taken
// at a field scale in poor light would move money on a guess. The supervisor
// confirms; nothing here writes a grade.
//
// `grade` is deliberately nullable. An unreadable photo returns null with the
// reason in `concerns`, and that is a SUCCESS — "I cannot tell" is the correct
// answer to a blurred image, and far more useful than a confident invention.
public record LeafGradeSuggestion(
        String grade,               // "A" | "B" | null
        BigDecimal confidence,      // 0.0000 - 1.0000
        List<String> observations,  // what it says it can see
        List<String> concerns,      // why it might be wrong
        String provider,
        Long visionId,              // the stored vision_inference row
        String imageUrl,            // where the bulk photo is served from
        String advice) {            // one sentence for the supervisor
}
