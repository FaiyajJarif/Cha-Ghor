package com.chaghor.chaghor.finance.dto;

import java.math.BigDecimal;

// The six KPI cards plus month-over-month percentage deltas for the top three.
public record FinanceSummaryResponse(
        BigDecimal totalRevenue,
        BigDecimal totalExpenses,
        BigDecimal netProfit,
        BigDecimal cashOnHand,
        BigDecimal payablesDue,
        BigDecimal overdue,
        double revenueChangePct,
        double expenseChangePct,
        double profitChangePct) {
}
