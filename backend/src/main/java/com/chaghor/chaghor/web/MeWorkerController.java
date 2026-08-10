package com.chaghor.chaghor.web;

import com.chaghor.chaghor.web.dto.MyWages;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// The worker's own data. Nothing else.
//
// NOTE THE SHAPE OF EVERY ROUTE: there is no `{id}` anywhere in this file, and
// there must never be one. The worker is resolved from the JWT inside
// MeWorkerService. That is not a convenience -- it is the entire security
// boundary for this tier.
//
// Everywhere else in this application the caller is an admin or a supervisor,
// and returning whatever id was requested is correct. A worker is the first
// caller for whom that is a breach: change a digit in the URL and you are
// reading a colleague's wages, loans and grievances. Removing the parameter
// removes the attack.
//
// ADMIN and SUPERVISOR are allowed through too, but they get the same treatment
// -- their OWN worker record, if they have one. This is not a back door into
// another worker's payroll; the admin console already has proper endpoints for
// that, with proper authorisation.
@RestController
@RequestMapping("/api/v1/me/worker")
@PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR','WORKER')")
public class MeWorkerController {

    private final MeWorkerService service;

    public MeWorkerController(MeWorkerService service) {
        this.service = service;
    }

    // The worker's own record. Every field is a real column on `workers`;
    // `gender` is null until the office fills it in (V31) rather than guessed.
    @GetMapping
    public Map<String, Object> profile() {
        return service.profile();
    }

    // Today from the registers: attendance status, lateness, kilos so far
    // against the configured quota, field and supervisor.
    @GetMapping("/today")
    public Map<String, Object> today() {
        return service.today();
    }

    // Every line of the wage formula for the current period and the last year,
    // in the order the engine computes them. See MyWages for why nothing is
    // rolled up.
    @GetMapping("/wages")
    public MyWages wages() {
        return service.wages();
    }

    // Outstanding loans and what is being deducted each day.
    @GetMapping("/loans")
    public Map<String, Object> loans() {
        return service.loans();
    }
}
