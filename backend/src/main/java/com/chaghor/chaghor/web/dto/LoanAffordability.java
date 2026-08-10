package com.chaghor.chaghor.web.dto;

import java.math.BigDecimal;

// What a given loan amount would actually mean for this worker.
//
// WHY THIS EXISTS AT ALL
//   The request was for a one-tap loan button. One-tap borrowing with no
//   thought step, aimed at low-income workers, is the shape of predatory
//   lending -- and this product exists to make debt VISIBLE. CHA_GHOR_IDEA.md
//   §1 names "loans never close" as one of the four failures it is built to
//   fix. So the tap stays, and what it does first is show the consequence.
//
//   Every figure below is arithmetic from the worker's own records: the
//   estate's standard daily deduction, what they already owe, their real
//   attendance rate, and their own recent payslips. A model is asked afterwards
//   to put ONE sentence of it into plain Bangla, and is explicitly permitted to
//   say the amount looks high. It approves nothing -- LoanService.decide()
//   remains the only path that changes a loan's status, and only an admin can
//   call it.
public record LoanAffordability(

        BigDecimal amount,

        // What would come out of each payslip-earning day.
        BigDecimal dailyDeduction,

        // Working days to clear it at that rate. Null when no deduction rate is
        // configured -- a term of "infinity" is not a number to show anybody.
        Integer workingDaysToClear,

        // The same term as calendar months, using the worker's OWN attendance
        // rate rather than assuming they work every day. Someone who works 18
        // days a month does not clear a 75-day loan in two and a half months.
        Integer approxMonthsToClear,

        // Debt after this loan, so the question is "what will I owe" rather
        // than "what am I borrowing".
        BigDecimal currentOutstanding,
        BigDecimal totalAfterThisLoan,

        // The monthly instalment against their own recent take-home. The single
        // most useful number here, and the one nobody is ever shown.
        BigDecimal recentAvgNetPay,
        Integer instalmentPctOfPay,

        // Set when the arithmetic cannot be done -- no deduction rate, or no
        // payslip history to compare against. The UI shows the request button
        // either way; it just cannot promise a term.
        String caveat) {
}
