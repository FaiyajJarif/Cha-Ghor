package com.chaghor.chaghor.fieldcase.dto;

// The AI's read on one complaint or field report.
//
// Everything here is a SUGGESTION. Nothing in this record changes the case:
// the category and priority are not applied, and the reply draft is not sent.
// An admin edits and acts, or ignores it.
//
// `duplicateOfTitle` is resolved server-side from the real case, never taken
// from the model's text, so the screen cannot show a case title that was made
// up. If the model named an id we did not send it, the whole duplicate claim is
// dropped before it gets here.
public record CaseReviewResponse(
        Long caseId,
        boolean available,
        String message,

        String suggestedCategory,
        String suggestedPriority,     // LOW | MEDIUM | HIGH
        String priorityReason,

        Long duplicateOf,
        String duplicateOfTitle,
        String duplicateConfidence,   // high | medium | low
        String duplicateReason,

        String language,              // bn | en | mixed
        String summaryOtherLanguage,
        String replyDraft,
        boolean looksLikeSpam,

        int candidatesConsidered,
        String provider) {

    public static CaseReviewResponse unavailable(Long caseId, String message) {
        return new CaseReviewResponse(caseId, false, message,
                null, null, null, null, null, null, null,
                null, null, null, false, 0, null);
    }
}
