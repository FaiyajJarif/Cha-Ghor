package com.chaghor.chaghor.attendance.dto;

import java.time.LocalDate;
import java.util.List;

// One worker's attendance for one month.
//
// `notMarked` is the gap between working days in the month and days that have
// a row. It is reported separately from `absent` on purpose: a day nobody
// filled in is not the same fact as a day the worker did not turn up, and
// conflating them would quietly cost someone their wage. Payroll counts rows,
// so an unmarked day already pays nothing -- this number is how a supervisor
// notices that before payday rather than after.
//
// `payableDays` = present + late, which is exactly what PayrollService uses for
// base pay, so this screen and the payslip can never disagree.
public record WorkerMonthResponse(
        Long workerId,
        String workerName,
        String month,          // yyyy-MM
        LocalDate from,
        LocalDate to,
        long present,
        long late,
        long absent,
        long onLeave,
        long marked,
        long notMarked,
        long payableDays,
        long totalLateMinutes,
        double attendancePct,  // payable / days elapsed in the month, 0-100
        List<Day> days) {

    public record Day(LocalDate date, String status, Long zoneId, String zoneName,
                      Integer lateMinutes) {
    }
}
