package com.chaghor.chaghor.harvest;

import com.chaghor.chaghor.audit.AuditService;
import com.chaghor.chaghor.harvest.dto.HarvestScheduleRequest;
import com.chaghor.chaghor.harvest.dto.HarvestScheduleResponse;
import com.chaghor.chaghor.notification.NotificationService;
import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

// Planned work on a field.
//
// This module is new, but the table is not: harvest_schedule shipped in V1 and
// sat empty for the life of the project while the Fields board pretended to
// save into it. Anything read here is therefore starting from zero rows, and
// every guard below exists because the old form could produce values the table
// would have rejected.
@Service
@RequiredArgsConstructor
public class HarvestScheduleService {

    // Kept in one place so the controller, the validator and the error message
    // cannot disagree about what is allowed. Mirrors chk_harvest_type and
    // chk_harvest_status in V28 exactly -- if these drift, the database wins and
    // the user sees a constraint violation instead of a sentence.
    private static final Set<String> TYPES =
            Set.of("daily", "weekly", "one-off", "maintenance");
    private static final Set<String> CREATABLE_STATUSES =
            Set.of("draft", "planned");
    private static final Set<String> ALL_STATUSES =
            Set.of("draft", "planned", "done", "cancelled");

    private final HarvestScheduleRepository repo;
    private final ZoneRepository zoneRepository;
    private final WorkerRepository workerRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final NotificationService notifications;

    // ---- reading ------------------------------------------------------------

    // The board's list: everything planned from `from` onwards.
    //
    // Defaults to today rather than to all history, because "Upcoming Harvest
    // Schedule" that opens on last March's pruning is not upcoming. Pass an
    // explicit date to look back.
    @Transactional(readOnly = true)
    public List<HarvestScheduleResponse> list(LocalDate from, boolean includeCancelled) {
        LocalDate start = (from != null) ? from : LocalDate.now();
        List<HarvestSchedule> rows =
                repo.findBySchedDateGreaterThanEqualOrderBySchedDateAscIdAsc(start);

        // Resolve every name in three queries rather than three per row. A
        // season of schedules would otherwise be hundreds of round trips.
        Map<Long, String> zones = zoneMap();
        Map<Long, String> workers = workerMap();
        Map<Long, String> users = userMap();

        List<HarvestScheduleResponse> out = new ArrayList<>();
        for (HarvestSchedule s : rows) {
            if (!includeCancelled && "cancelled".equals(s.getStatus())) continue;
            out.add(toResponse(s, zones, workers, users));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<HarvestScheduleResponse> listForZone(Long zoneId) {
        Map<Long, String> zones = zoneMap();
        Map<Long, String> workers = workerMap();
        Map<Long, String> users = userMap();
        List<HarvestScheduleResponse> out = new ArrayList<>();
        for (HarvestSchedule s : repo.findByZoneIdOrderBySchedDateDesc(zoneId)) {
            out.add(toResponse(s, zones, workers, users));
        }
        return out;
    }

    // ---- writing ------------------------------------------------------------

    @Transactional
    public HarvestScheduleResponse create(HarvestScheduleRequest req, String actorUsername) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No schedule was sent.");
        }

        // A replayed queued create is not a second job. Answer as though it
        // succeeded so the handset clears its outbox, but do NOT insert again.
        // Checked before anything else, so a replay still succeeds even if the
        // field has since been retired -- the work was planned when the field
        // was live, and failing the replay would strand the entry in the queue
        // forever.
        if (req.clientUuid() != null) {
            var existing = repo.findFirstByClientUuid(req.clientUuid());
            if (existing.isPresent()) {
                return toResponse(existing.get(), zoneMap(), workerMap(), userMap());
            }
        }

        Zone zone = zoneRepository.findById(req.zoneId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "That field no longer exists."));

        // A retired field still holds its history, but nothing new should be
        // planned on it -- that is what retiring it meant.
        if (zone.getArchivedAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That field has been retired. Restore it before planning work on it.");
        }

        String type = normaliseType(req.type());
        String status = normaliseStatus(req.status(), CREATABLE_STATUSES,
                "A new schedule can only be saved as a draft or as planned.");

        Long workerId = null;
        if (req.workerId() != null) {
            Worker w = workerRepository.findById(req.workerId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "That worker no longer exists."));
            workerId = w.getId();
        }

        BigDecimal expected = req.expectedKg();
        if (expected != null && expected.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Expected harvest cannot be negative.");
        }

        HarvestSchedule s = HarvestSchedule.builder()
                .zoneId(zone.getId())
                .schedDate(req.date())
                .task(trimToNull(req.title()))
                .description(trimToNull(req.description()))
                .schedType(type)
                .expectedKg(expected)
                .workerId(workerId)
                .supervisorId(actorId(actorUsername))
                .status(status)
                .attachmentUrl(trimToNull(req.attachmentUrl()))
                .createdAt(OffsetDateTime.now())
                .clientUuid(req.clientUuid())
                .build();
        repo.save(s);

        audit("harvest.create", s.getId(), null, snapshot(s));
        push("Harvest schedule added",
                "Work planned on " + zone.getName() + " for " + s.getSchedDate());
        return toResponse(s, zoneMap(), workerMap(), userMap());
    }

    @Transactional
    public HarvestScheduleResponse update(Long id, HarvestScheduleRequest req) {
        HarvestSchedule s = find(id);
        Map<String, Object> before = snapshot(s);

        if (req.zoneId() != null && !req.zoneId().equals(s.getZoneId())) {
            Zone zone = zoneRepository.findById(req.zoneId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "That field no longer exists."));
            s.setZoneId(zone.getId());
        }
        if (req.date() != null) s.setSchedDate(req.date());
        if (req.title() != null) s.setTask(trimToNull(req.title()));
        if (req.description() != null) s.setDescription(trimToNull(req.description()));
        if (req.type() != null) s.setSchedType(normaliseType(req.type()));
        if (req.expectedKg() != null) {
            if (req.expectedKg().signum() < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Expected harvest cannot be negative.");
            }
            s.setExpectedKg(req.expectedKg());
        }
        if (req.workerId() != null) {
            Worker w = workerRepository.findById(req.workerId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.NOT_FOUND, "That worker no longer exists."));
            s.setWorkerId(w.getId());
        }
        if (req.attachmentUrl() != null) s.setAttachmentUrl(trimToNull(req.attachmentUrl()));

        repo.save(s);
        audit("harvest.update", s.getId(), before, snapshot(s));
        push("Harvest schedule changed", "A planned job was edited.");
        return toResponse(s, zoneMap(), workerMap(), userMap());
    }

    // Move a schedule through its lifecycle.
    //
    // Kept separate from update() on purpose: marking work DONE is a different
    // act from correcting its title, and the audit trail should be able to say
    // which one happened. completed_at is owned here and nowhere else.
    @Transactional
    public HarvestScheduleResponse setStatus(Long id, String rawStatus) {
        HarvestSchedule s = find(id);
        String status = normaliseStatus(rawStatus, ALL_STATUSES,
                "A schedule can only be draft, planned, done or cancelled.");
        String from = s.getStatus();

        if (status.equals(from)) {
            return toResponse(s, zoneMap(), workerMap(), userMap());
        }

        s.setStatus(status);
        // Only 'done' carries a completion time. Re-opening a job clears it,
        // rather than leaving a date that says it finished when it has not.
        s.setCompletedAt("done".equals(status) ? OffsetDateTime.now() : null);
        repo.save(s);

        try {
            auditService.recordTransition("harvest_schedule", s.getId(), from, status, snapshot(s));
        } catch (Exception ignored) {
            // The status change is committed; a failed audit write must not
            // roll it back.
        }
        push("Harvest schedule " + status, describe(s));
        return toResponse(s, zoneMap(), workerMap(), userMap());
    }

    @Transactional
    public void delete(Long id) {
        HarvestSchedule s = find(id);
        Map<String, Object> before = snapshot(s);
        repo.delete(s);
        audit("harvest.delete", id, before, null);
        push("Harvest schedule removed", describe(s));
    }

    // ---- helpers ------------------------------------------------------------

    private HarvestSchedule find(Long id) {
        return repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "That schedule no longer exists."));
    }

    // The UI shows "Daily"; the column stores "daily". Normalising here means a
    // capitalised value from an older client is accepted rather than rejected by
    // chk_harvest_type with a message no supervisor could act on.
    private String normaliseType(String raw) {
        String t = (raw == null || raw.isBlank()) ? "one-off" : raw.trim().toLowerCase();
        if (!TYPES.contains(t)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Schedule type must be daily, weekly, one-off or maintenance.");
        }
        return t;
    }

    private String normaliseStatus(String raw, Set<String> allowed, String message) {
        String s = (raw == null || raw.isBlank()) ? "planned" : raw.trim().toLowerCase();
        if (!allowed.contains(s)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return s;
    }

    private Long actorId(String username) {
        if (username == null) return null;
        return userRepository.findByUsername(username).map(User::getId).orElse(null);
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private Map<Long, String> zoneMap() {
        Map<Long, String> m = new HashMap<>();
        for (Zone z : zoneRepository.findAll()) m.put(z.getId(), z.getName());
        return m;
    }

    private Map<Long, String> workerMap() {
        Map<Long, String> m = new HashMap<>();
        for (Worker w : workerRepository.findAll()) m.put(w.getId(), w.getFullName());
        return m;
    }

    // Display name if the user set one, else the username. Never null, so the
    // board does not have to handle a blank owner column.
    private Map<Long, String> userMap() {
        Map<Long, String> m = new HashMap<>();
        for (User u : userRepository.findAll()) {
            String name = (u.getDisplayName() == null || u.getDisplayName().isBlank())
                    ? u.getUsername()
                    : u.getDisplayName();
            m.put(u.getId(), name);
        }
        return m;
    }

    private String describe(HarvestSchedule s) {
        String title = (s.getTask() == null || s.getTask().isBlank()) ? "Planned work" : s.getTask();
        return title + " on " + s.getSchedDate();
    }

    private HarvestScheduleResponse toResponse(HarvestSchedule s,
                                               Map<Long, String> zones,
                                               Map<Long, String> workers,
                                               Map<Long, String> users) {
        // Overdue is derived, never stored: the day has passed and the work is
        // still only planned. A stored flag would need a nightly job and would
        // spend most of its life lying.
        boolean overdue = s.getSchedDate() != null
                && s.getSchedDate().isBefore(LocalDate.now())
                && ("planned".equals(s.getStatus()) || "draft".equals(s.getStatus()));

        return new HarvestScheduleResponse(
                s.getId(),
                s.getZoneId(),
                zones.get(s.getZoneId()),
                s.getSchedDate(),
                s.getTask(),
                s.getDescription(),
                s.getSchedType(),
                s.getExpectedKg(),
                s.getWorkerId(),
                s.getWorkerId() == null ? null : workers.get(s.getWorkerId()),
                s.getSupervisorId(),
                s.getSupervisorId() == null ? null : users.get(s.getSupervisorId()),
                s.getStatus(),
                s.getAttachmentUrl(),
                s.getCreatedAt(),
                s.getCompletedAt(),
                overdue);
    }

    private Map<String, Object> snapshot(HarvestSchedule s) {
        return AuditService.details(
                "zoneId", s.getZoneId(),
                "date", s.getSchedDate() == null ? null : s.getSchedDate().toString(),
                "title", s.getTask(),
                "type", s.getSchedType(),
                "expectedKg", s.getExpectedKg() == null ? null : s.getExpectedKg().toPlainString(),
                "workerId", s.getWorkerId(),
                "status", s.getStatus());
    }

    private void audit(String action, Long id, Map<String, Object> before, Map<String, Object> after) {
        try {
            auditService.record(action, "harvest_schedule", id, before, after);
        } catch (Exception ignored) {
            // The schedule is saved; a failed audit write must not undo it.
        }
    }

    // One frame per change, so an open Fields board updates itself.
    private void push(String title, String body) {
        try {
            notifications.send(title, body, "harvest.saved", null);
        } catch (Exception ignored) {
            // A dropped frame must never fail a save that already committed.
        }
    }
}
