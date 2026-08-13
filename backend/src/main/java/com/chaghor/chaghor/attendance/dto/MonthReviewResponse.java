package com.chaghor.chaghor.attendance.dto;

import java.time.LocalDate;
import java.util.List;

// The month-in-review a supervisor gets on a button press.
//
// Every number here is counted in Java from the register. The LLM is given
// these figures and asked only to write the covering paragraph -- it is never
// asked what the numbers are, so it cannot invent one. If the AI service is
// down, `narrative` is null and the whole screen still works, because the lists
// below are what actually matter.
public record MonthReviewResponse(
        String month,
        LocalDate from,
        LocalDate to,
        int workingDays,
        int workersConsidered,
        List<WorkerLine> mostPresent,
        List<WorkerLine> persistentlyLate,
        List<WorkerLine> excessiveAbsence,
        List<WorkerLine> excessiveLeave,
        List<WorkerLine> unmarkedHeavy,
        String narrative,
        String narrativeError) {

    // One worker's month, with the figure that put them on this list.
    public record WorkerLine(
            Long workerId,
            String name,
            long present,
            long late,
            long absent,
            long onLeave,
            long notMarked,
            long totalLateMinutes,
            double attendancePct,
            String note) {
    }
}
