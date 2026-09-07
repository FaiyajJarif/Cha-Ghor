package com.chaghor.chaghor.finance.dto;

import java.math.BigDecimal;

// One month on the Cashflow & Profit Trends chart. `month` is a short label
// (e.g. "Jan"); profit = revenue - expense.
public record TrendPoint(String month, BigDecimal revenue, BigDecimal expense, BigDecimal profit) {
}
