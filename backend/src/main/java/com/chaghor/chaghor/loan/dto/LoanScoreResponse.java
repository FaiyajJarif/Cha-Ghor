package com.chaghor.chaghor.loan.dto;

import java.math.BigDecimal;
import java.util.Map;

// One AI credit assessment, as shown next to a pending loan request.
//
// `facts` is the exact fact sheet the judgement was based on, computed in Java
// from the estate's records. It is returned so the admin can see the evidence
// rather than only the verdict -- the numbers are ours, the opinion is the
// model's.
//
// `recommendation` is advisory. Approve and reject remain the admin's buttons;
// nothing here decides anything.
public record LoanScoreResponse(
        Long loanId,
        boolean available,
        String message,
        String risk,            // low | med | high
        String recommendation,  // approve | review | decline
        BigDecimal suggestedAmount,
        String reasonEn,
        String reasonBn,
        String model,
        String assessedAt,
        Map<String, Object> facts) {

    public static LoanScoreResponse unavailable(Long loanId, String message) {
        return new LoanScoreResponse(loanId, false, message, null, null, null,
                null, null, null, null, Map.of());
    }
}
