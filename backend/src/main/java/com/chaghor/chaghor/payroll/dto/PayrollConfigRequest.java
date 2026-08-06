package com.chaghor.chaghor.payroll.dto;

import java.math.BigDecimal;

// Body for PUT /payroll/config (all fields optional; nulls keep the old value).
public record PayrollConfigRequest(
        BigDecimal baseDailyWage,
        BigDecimal leafQuotaKg,
        BigDecimal surplusRate,
        BigDecimal gradeBonusRate) {
}
