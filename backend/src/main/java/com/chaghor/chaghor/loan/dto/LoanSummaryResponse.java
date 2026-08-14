package com.chaghor.chaghor.loan.dto;

import java.math.BigDecimal;

// The five KPI cards at the top of the Loan Management screen.
public record LoanSummaryResponse(
        long activeLoans,      // ACTIVE + OVERDUE (currently outstanding)
        long pendingRequests,  // awaiting an admin decision
        long approved,         // approved in the last 30 days
        BigDecimal recovered,  // total repaid across all loans
        long overdue           // loans behind on repayment
) {}
