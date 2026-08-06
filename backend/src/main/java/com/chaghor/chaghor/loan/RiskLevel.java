package com.chaghor.chaghor.loan;

// Postgres native enum `risk_level`. The labels are LOWERCASE and the middle
// one is `med`, not `medium` -- sending "MEDIUM" throws
// `invalid input value for enum risk_level`. Keep these names exactly as they
// are so @JdbcTypeCode(SqlTypes.NAMED_ENUM) can map them directly.
public enum RiskLevel {
    low,
    med,
    high
}
