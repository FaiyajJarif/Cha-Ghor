package com.chaghor.chaghor.payroll.dto;

import java.util.List;

// What a pay run actually did — including who it LEFT OUT.
//
// WHY THE SKIPPED LIST EXISTS
//   generate() only issues a payslip to a worker whose status is "active".
//   Anyone marked on_leave or inactive was skipped with no error, no mention
//   and no payslip. The admin pressed "Apply to Pay Run", watched other workers
//   appear, and had no way to learn that somebody had been left out.
//
//   That is the exact failure this product exists to end: a person who worked
//   and does not get paid, with nothing on any screen saying why. Returning
//   only the payslips it created made the omission invisible.
public record GenerateResult(
        List<PayrollResponse> payslips,
        List<Skipped> skipped) {

    // A worker who got no payslip, why, and whether they actually worked in
    // the period. `workedInPeriod` is the one that matters: a worker who is
    // inactive AND did nothing is unremarkable, but a worker who was skipped
    // while attendance says they turned up is a problem someone must look at.
    public record Skipped(
            Long workerId,
            String workerName,
            String status,
            boolean workedInPeriod,
            String reason) {
    }
}
