package com.chaghor.chaghor.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

// One worker's own pay, as they see it.
//
// THIS IS THE PAYOFF OF THE WHOLE PROJECT. CHA_GHOR_IDEA.md §1 lists four
// failures the product exists to fix, and two of them -- "advances vanish" and
// "loans never close" -- are invisible to the person they happen to. A worker
// cannot currently verify their own kilos or their own arithmetic. This is the
// screen that changes that, so it shows every line of the wage formula, in the
// same order the engine computes them, with nothing rolled up or hidden.
//
// The original mockup showed base / attendance bonus / collection bonus / tax.
// There is no attendance bonus and no tax in this system, and it omitted the
// loan deduction and the advance recovery -- the exact two lines a worker most
// needs to see. Rebuilding that would have rebuilt the dispute.
public record MyWages(

        // The month in progress. Null when no payslip has been generated yet,
        // which is an ordinary state early in a period.
        Period current,

        // Closed periods, newest first.
        List<Period> history) {

    public record Period(
            LocalDate periodStart,
            LocalDate periodEnd,

            // draft | review | approved | paid.
            //
            // A DRAFT IS NOT A PROMISE. It moves as more leaf is weighed and as
            // deductions are settled, and the UI must label it provisional. A
            // worker who reads a draft as final has been misled by the screen
            // that was supposed to end exactly that confusion.
            String status,
            boolean provisional,

            // What the pay was computed from, so the arithmetic can be checked
            // rather than trusted.
            int presentDays,
            BigDecimal leafKg,
            BigDecimal gradeAKg,

            // --- earnings -------------------------------------------------
            BigDecimal base,          // (present + late) days x daily wage
            BigDecimal surplus,       // kg above quota, per day x rate
            BigDecimal gradeBonus,    // grade-A kg x rate
            BigDecimal gross,

            // --- deductions -----------------------------------------------
            BigDecimal loanDeduction,      // owned by recompute(), from real loans
            BigDecimal advanceRecovery,    // advances already paid out
            BigDecimal otherDeduction,     // entered by the office

            // Floors at zero. A shortfall stays owed on the loan rather than
            // becoming a negative wage.
            BigDecimal netPayable,

            String paidOn) {
    }
}
