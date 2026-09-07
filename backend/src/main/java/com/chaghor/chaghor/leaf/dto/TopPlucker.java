package com.chaghor.chaghor.leaf.dto;

import java.math.BigDecimal;

// One line of the pluckers' leaderboard.
//
// NOTE WHAT IS NOT HERE: a "score". The sample data this replaced carried a
// score out of 100 next to every name, and no such number exists anywhere in
// this system -- there is no scoring model, no formula and no column. It was
// invented to make a mockup look complete, and on a screen an estate manager
// uses to judge people, an invented number beside a real name is the worst
// possible kind of decoration.
//
// Kilos and days worked are measured. That is what this carries.
public record TopPlucker(
        Long workerId,
        String name,
        String zone,
        // Total plucked over the window.
        BigDecimal totalKg,
        // Days they actually weighed in, so a big total from one huge day is
        // not mistaken for consistency.
        long days,
        BigDecimal avgKgPerDay) {
}
