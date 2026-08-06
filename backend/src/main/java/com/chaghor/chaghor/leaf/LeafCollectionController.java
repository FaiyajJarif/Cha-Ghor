package com.chaghor.chaghor.leaf;

import com.chaghor.chaghor.leaf.dto.LeafRecordRequest;
import com.chaghor.chaghor.leaf.dto.LeafResponse;
import com.chaghor.chaghor.leaf.dto.LeafSummaryResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/leaf")
@RequiredArgsConstructor
public class LeafCollectionController {

    private final LeafCollectionService service;

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
    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public LeafResponse record(@Valid @RequestBody LeafRecordRequest req, Authentication auth) {
        String username = (auth != null) ? auth.getName() : null;
        return service.record(req, username);
    }
}
