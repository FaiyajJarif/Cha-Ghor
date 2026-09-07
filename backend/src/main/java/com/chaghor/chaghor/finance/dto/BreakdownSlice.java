package com.chaghor.chaghor.finance.dto;

import java.math.BigDecimal;

// One slice of the Expenses Breakdown donut: an account, its total, and its
// share of overall spending (percent, one decimal).
public record BreakdownSlice(String label, BigDecimal amount, double percent) {
}
