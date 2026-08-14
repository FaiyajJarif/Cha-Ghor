package com.chaghor.chaghor.payroll.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDate;

// Body for POST /payroll/generate.
public record GenerateRequest(
        @JsonFormat(pattern = "yyyy-MM-dd") LocalDate periodStart,
        @JsonFormat(pattern = "yyyy-MM-dd") LocalDate periodEnd) {
}
