package com.chaghor.chaghor.report.dto;

import java.time.LocalDate;

// "Generate report" payload. All fields are optional: a blank title defaults to
// "Monthly Report - <Month YYYY>", a missing period defaults to the current
// calendar month, and language ("en" | "bn") selects the AI narrative language.
public record GenerateReportRequest(
        String title,
        LocalDate periodStart,
        LocalDate periodEnd,
        String language) {
}
