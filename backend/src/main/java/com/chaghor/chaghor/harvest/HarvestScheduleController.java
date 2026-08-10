package com.chaghor.chaghor.harvest;

import com.chaghor.chaghor.harvest.dto.HarvestScheduleRequest;
import com.chaghor.chaghor.harvest.dto.HarvestScheduleResponse;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

// Planned work on a field.
//
// SUPERVISOR-OWNED, deliberately. Planning the round and marking it done are
// both things the person walking the estate does; an office that plans work it
// cannot see is how paper schedules stopped being followed in the first place.
// Admin can read and write too, because admin can open the supervisor console.
//
// Contrast with zone CRUD next door, which is hasRole('ADMIN'): creating and
// retiring FIELDS changes what every supervisor sees, and the daily target is
// the number a supervisor's own performance is measured against.
@RestController
@RequestMapping("/api/v1/harvest-schedules")
public class HarvestScheduleController {

    private final HarvestScheduleService service;
    private final PluckAdvisorService advisor;

    public HarvestScheduleController(HarvestScheduleService service,
                                     PluckAdvisorService advisor) {
        this.service = service;
        this.advisor = advisor;
    }

    // Which field to pluck next, and why.
    //
    // The ranking is arithmetic and always returned. `narrative` asks the AI
    // service for a paragraph on top; it defaults to false so opening the board
    // does not spend a model call, and a failure there leaves the table intact.
    @GetMapping("/advice")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public com.chaghor.chaghor.harvest.dto.PluckAdvice advice(
            @RequestParam(required = false, defaultValue = "false") boolean narrative) {
        return advisor.advise(narrative);
    }

    // Everything planned from `from` onwards, soonest first. Defaults to today.
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<HarvestScheduleResponse> list(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false, defaultValue = "false") boolean includeCancelled) {
        return service.list(from, includeCancelled);
    }

    @GetMapping("/zone/{zoneId}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<HarvestScheduleResponse> forZone(@PathVariable Long zoneId) {
        return service.listForZone(zoneId);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public HarvestScheduleResponse create(@Valid @RequestBody HarvestScheduleRequest req,
                                          Authentication auth) {
        // The signed-in user becomes the owning supervisor. Taken from the
        // token, never from the request body -- a client must not be able to
        // file work under someone else's name.
        return service.create(req, auth == null ? null : auth.getName());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public HarvestScheduleResponse update(@PathVariable Long id,
                                          @RequestBody HarvestScheduleRequest req) {
        return service.update(id, req);
    }

    // draft | planned | done | cancelled.
    @PutMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public HarvestScheduleResponse setStatus(@PathVariable Long id,
                                             @RequestBody Map<String, String> body) {
        return service.setStatus(id, body == null ? null : body.get("status"));
    }

    // A real delete, unlike zones.
    //
    // A schedule is a PLAN, not a record of something that happened: no wage,
    // weigh-in or ledger row ever points at one, so removing a job that was
    // entered by mistake destroys no history. The audit trail keeps what it
    // was. Cancelling is the right move for work that was genuinely planned and
    // then dropped, and that is a status, not a delete.
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
