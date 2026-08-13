package com.chaghor.chaghor.attendance.dto;

import java.time.LocalDate;
import java.util.List;

// One suspicious pattern found in the register.
//
// IMPORTANT, AND IT MUST STAY IN THE UI: a flag is NOT an accusation. Every rule
// here has an innocent explanation — a plucker can legitimately have zero leaf
// because they spent the day pruning, and a whole zone really can turn up.
// These point a supervisor at rows worth a second look; they never change a
// mark, never touch pay, and are not stored as a judgement about anyone.
//
// `evidence` is the arithmetic that produced the flag, in plain words, so the
// person reading it can disagree on the facts rather than trusting a label.
public record AttendanceFlag(
        String rule,        // stable id, e.g. "present_no_leaf"
        String title,
        String severity,    // HIGH | MED | LOW
        LocalDate date,
        Long zoneId,
        String zoneName,
        List<Named> workers,
        String evidence,
        String innocentExplanation) {

    public record Named(Long workerId, String name) {
    }
}
