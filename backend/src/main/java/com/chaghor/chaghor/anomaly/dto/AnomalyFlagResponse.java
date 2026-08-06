package com.chaghor.chaghor.anomaly.dto;

// One thing the AI thought was worth a human looking at.
//
// `ref` is the id of the real row it refers to (a payroll id or a loan id). It
// has been checked against the database before this record is built, so a ref
// here always points at something that exists. `label` is the human-facing
// identifier for that row (worker name, loan reference), resolved server-side
// rather than taken from the model, so the screen never shows a name the model
// made up.
public record AnomalyFlagResponse(
        Long ref,
        String label,
        String severity,   // high | medium | low
        String title,
        String reason) {
}
