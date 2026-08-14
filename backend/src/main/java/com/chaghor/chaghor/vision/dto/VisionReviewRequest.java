package com.chaghor.chaghor.vision.dto;

// A supervisor's ruling on what the model claimed.
//
// THIS IS THE TRAINING LABEL. Every row with a verdict is one labelled example
// of "model said X, a person who was standing there said Y". Without it the
// system accumulates thousands of unverified model outputs, which is worth
// nothing for training a CNN later; with it, ordinary daily use builds the
// dataset as a side effect of people doing their job.
public record VisionReviewRequest(
        // agree | disagree | unsure
        String verdict,
        // What the condition ACTUALLY was, when the supervisor disagreed.
        String correctedCondition,
        // The pluck grade finally recorded, so model-vs-human can be measured
        // on grading as well as on diagnosis.
        String correctedGrade
) {}
