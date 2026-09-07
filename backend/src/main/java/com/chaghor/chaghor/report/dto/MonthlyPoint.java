package com.chaghor.chaghor.report.dto;

import java.math.BigDecimal;

// One month on the Reports trend chart. `month` is a short label (e.g. \"Jan\");
// profit = revenue - expense.
public record MonthlyPoint(String month, BigDecimal revenue, BigDecimal expense, BigDecimal profit) {
}
