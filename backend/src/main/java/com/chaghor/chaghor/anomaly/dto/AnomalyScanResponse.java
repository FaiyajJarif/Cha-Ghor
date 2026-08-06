package com.chaghor.chaghor.anomaly.dto;

import java.util.List;

// The result of one anomaly scan.
//
// `discarded` is deliberately exposed rather than hidden: it counts flags the
// model returned that pointed at rows which do not exist, or that were
// malformed. A non-zero value is useful signal about how much the model is
// making up, and the UI shows it.
//
// `available` is false when the AI service could not be reached. That is not an
// error the page should blow up on -- anomaly flags are advisory, so the screen
// says the reviewer is offline and carries on.
public record AnomalyScanResponse(
        String scope,
        boolean available,
        String message,
        int rowsReviewed,
        int discarded,
        String provider,
        List<AnomalyFlagResponse> flags) {

    public static AnomalyScanResponse unavailable(String scope, String message) {
        return new AnomalyScanResponse(scope, false, message, 0, 0, null, List.of());
    }
}
