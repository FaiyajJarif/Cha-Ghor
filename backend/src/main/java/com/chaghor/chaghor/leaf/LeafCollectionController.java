package com.chaghor.chaghor.leaf;

import com.chaghor.chaghor.leaf.dto.LeafRecordRequest;
import com.chaghor.chaghor.leaf.dto.LeafGradeSuggestion;
import com.chaghor.chaghor.leaf.dto.YieldForecast;
import org.springframework.web.multipart.MultipartFile;
import com.chaghor.chaghor.leaf.dto.LeafHealthReport;
import com.chaghor.chaghor.leaf.dto.LeafResponse;
import com.chaghor.chaghor.leaf.dto.ZonePerformance;
import com.chaghor.chaghor.leaf.dto.LeafSummaryResponse;
import com.chaghor.chaghor.leaf.dto.LeafTrendPoint;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import com.chaghor.chaghor.vision.VisionInference;
import com.chaghor.chaghor.vision.dto.VisionReviewRequest;
import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/v1/leaf")
@RequiredArgsConstructor
public class LeafCollectionController {

    private final LeafCollectionService service;
    private final LeafGradingService grading;
    private final LeafHealthService health;
    private final com.chaghor.chaghor.vision.VisionReviewService visionReview;

    // Day sheet: all plucks recorded on `date` (defaults to today).
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<LeafResponse> list(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.listByDate(date);
    }

    // Small KPI card for a day: entry count + total kg.
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public LeafSummaryResponse summary(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.summary(date);
    }

    // Record one pluck. recorded_by is taken from the logged-in user.
    // Per-day totals for the collection history chart.
    @GetMapping("/trend")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<LeafTrendPoint> trend(@RequestParam(defaultValue = "14") int days) {
        return service.trend(days);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public LeafResponse record(@Valid @RequestBody LeafRecordRequest req, Authentication auth) {
        String username = (auth != null) ? auth.getName() : null;
        return service.record(req, username);
    }

    // Correct a weigh-in. A mistyped weight used to be permanent, and it feeds
    // the payroll surplus, so the amendment is audited with before and after.
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public LeafResponse update(@PathVariable Long id,
                               @RequestBody LeafRecordRequest req,
                               Authentication auth) {
        return service.update(id, req, auth != null ? auth.getName() : null);
    }

    // Remove a weigh-in entered in error. The audit trail keeps what it was.
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    // Per-zone performance for the heatmap: today's kilos per worker against
    // that zone's own recent norm and against the estate.
    @GetMapping("/zone-performance")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<ZonePerformance> zonePerformance(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.zonePerformance(date);
    }

    // ---- AI ------------------------------------------------------------------

    // Suggest a quality grade from a photograph.
    //
    // ADVISORY. It returns a suggestion and records it; it never sets a grade.
    // Grade A pays a bonus per kilo, so the supervisor confirms.
    @PostMapping("/grade-photo")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public LeafGradeSuggestion gradePhoto(@RequestParam("file") MultipartFile file,
                                          @RequestParam(required = false) String ref) {
        return grading.grade(file, ref);
    }

    // Expected leaf per field for a day (default: tomorrow). Arithmetic over
    // recent picking, adjusted for rain, with its assumptions returned.
    @GetMapping("/forecast")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public YieldForecast forecast(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.forecast(date);
    }

    // Examine leaf CONDITION -- disease, deficiency, scorch, damage.
    //
    // A different question from /grade-photo, on a different photograph: this
    // one works on leaf still growing on the bush, which the pluck grader
    // correctly refuses. Advisory, ranked candidates, never a chemical.
    @PostMapping("/health-photo")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public LeafHealthReport healthPhoto(@RequestParam("file") MultipartFile file,
                                        @RequestParam(required = false) String ref) {
        return health.assess(file, ref);
    }

    // ---- the training trail --------------------------------------------------

    // Record what a person decided about a model's suggestion.
    //
    // This is what turns daily use into a labelled dataset: the pair of "model
    // said X" and "the supervisor standing at the scale said Y". Nothing here
    // changes a grade on a weigh-in.
    @PostMapping("/vision/{id}/review")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public VisionInference reviewVision(@PathVariable Long id,
                                        @RequestBody VisionReviewRequest req) {
        return visionReview.review(id, req);
    }

    // How the grader is actually doing, from readings a human has checked.
    // Refusals are excluded from accuracy rather than scored as wrong.
    @GetMapping("/vision/accuracy")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public Map<String, Object> visionAccuracy() {
        return visionReview.accuracy();
    }
}
