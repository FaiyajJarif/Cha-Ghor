package com.chaghor.chaghor.anomaly;

import com.chaghor.chaghor.anomaly.dto.AnomalyScanResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// AI anomaly flags. Read-only and stateless: every call re-reviews the current
// rows, so a flag goes away as soon as the record is fixed. Nothing is stored.
//
// Same RBAC as the pages these flags appear on (Payroll and Loans are both
// readable by admin and supervisor).
@RestController
@RequestMapping("/api/v1/anomalies")
@RequiredArgsConstructor
public class AnomalyController {

    private final AnomalyService service;

    // scope = payroll | loan
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public AnomalyScanResponse scan(@RequestParam(defaultValue = "payroll") String scope) {
        return service.scan(scope);
    }
}
