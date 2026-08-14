package com.chaghor.chaghor.web.dto;

import java.math.BigDecimal;
import java.util.List;

// Why this month's pay differs from last month's.
//
// THE POINT OF THE WHOLE PRODUCT, ONE LAYER DOWN.
//   CHA_GHOR_IDEA.md §1, failure one: "A worker cannot verify their own kilos
//   or their own arithmetic." Showing the seven payslip lines proves WHAT they
//   were paid. This explains WHY IT MOVED, which is the question that actually
//   starts arguments.
//
// IT MUST RECONCILE TO THE TAKA.
//   `components` sums to `netDifference`. Exactly. Not approximately, not
//   "mostly" with a rounding remainder swept somewhere. An explanation that
//   does not add up is worse than no explanation: it invites a worker to trust
//   it, and then falls apart the moment somebody checks — which is precisely
//   the trust this system is trying to build. `reconciles` is computed, not
//   asserted, and the UI hides the panel when it is false.
//
// NO MODEL DECIDES ANYTHING HERE. Every figure is arithmetic over two payroll
// rows. A model is later asked to phrase the result in Bangla and is forbidden
// from changing a number or inventing a cause.
public record PayChange(

        boolean available,

        // Why not, when unavailable — no previous period, or the first month on
        // the estate. Said plainly rather than rendering an empty panel.
        String unavailableReason,

        String thisPeriodLabel,
        String previousPeriodLabel,

        BigDecimal thisNet,
        BigDecimal previousNet,

        // Positive = better off this month.
        BigDecimal netDifference,

        // Each line of the wage formula that moved, largest effect first.
        List<Component> components,

        // components sum == netDifference. Computed after the fact as a check
        // on this class's own arithmetic.
        boolean reconciles) {

    public record Component(
            // base | surplus | gradeBonus | loanDeduction | advanceRecovery | otherDeduction
            String key,

            // Signed, in taka. Negative means it reduced this month's pay.
            BigDecimal amount,

            // The measurement behind it, so the claim can be checked against
            // the payslip above rather than believed. e.g. presentDays 20 -> 18.
            String fromValue,
            String toValue) {
    }
}
