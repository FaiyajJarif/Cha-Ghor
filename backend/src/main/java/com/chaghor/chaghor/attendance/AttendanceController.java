package com.chaghor.chaghor.attendance;

import jakarta.validation.Valid;
import com.chaghor.chaghor.attendance.dto.AttendanceBulkRequest;
import com.chaghor.chaghor.attendance.dto.AttendanceResponse;
import com.chaghor.chaghor.attendance.dto.AttendanceSummaryResponse;
import com.chaghor.chaghor.attendance.dto.AttendanceTrendPoint;
import com.chaghor.chaghor.attendance.dto.AttendanceFlag;
import com.chaghor.chaghor.attendance.dto.MonthReviewResponse;
import com.chaghor.chaghor.attendance.dto.WorkerMonthResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/attendance")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;
    private final AttendanceFlagService flagService;
    private final MonthReviewService monthReviewService;

    // Prefill the sheet with whatever was already saved for that day.
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<AttendanceResponse> list(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return attendanceService.listByDate(date);
    }

    // One day's counts for the supervisor dashboard KPI card.
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public AttendanceSummaryResponse summary(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return attendanceService.summary(date);
    }

    // Per-day counts for the trend chart (default: the last 7 days).
    @GetMapping("/trend")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<AttendanceTrendPoint> trend(@RequestParam(defaultValue = "7") int days) {
        return attendanceService.trend(days);
    }

    // Save the whole sheet at once. marked_by is taken from the logged-in user.
    @PostMapping("/bulk")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<AttendanceResponse> bulk(@Valid @RequestBody AttendanceBulkRequest req, Authentication auth) {
        String username = (auth != null) ? auth.getName() : null;
        return attendanceService.bulkUpsert(req, username);
    }

    // One worker's month: how many days present, late, absent, on leave — and
    // how many days nobody marked at all, which is the one that quietly costs
    // a worker their wage. `month` is yyyy-MM and defaults to the current one.
    @GetMapping("/worker/{workerId}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public WorkerMonthResponse workerMonth(@PathVariable Long workerId,
                                           @RequestParam(required = false) String month) {
        return attendanceService.workerMonth(workerId, month);
    }

    // ---- AI ----------------------------------------------------------------

    // Proxy-attendance flags for one day. These are patterns in the register,
    // NOT accusations -- every flag ships with its own innocent explanation and
    // nothing here changes a mark or affects pay.
    @GetMapping("/flags")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<AttendanceFlag> flags(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return flagService.flags(date);
    }

    // Review a whole month on a button press. Counts are computed here; the
    // model only writes the covering paragraph, and the report still returns
    // without it if the AI service is down.
    @PostMapping("/review")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public MonthReviewResponse review(@RequestParam(required = false) String month,
                                      @RequestParam(defaultValue = "true") boolean narrative) {
        return monthReviewService.review(month, narrative);
    }
}
