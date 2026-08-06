package com.chaghor.chaghor.payroll;

// lowercase to match the Postgres enum labels ('draft','review','approved','paid')
public enum PayrollStatus {
    draft,
    review,
    approved,
    paid
}
