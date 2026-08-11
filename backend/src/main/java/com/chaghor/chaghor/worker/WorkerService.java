package com.chaghor.chaghor.worker;

import com.chaghor.chaghor.user.Locale;
import com.chaghor.chaghor.user.Role;
import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.dto.MetaResponse;
import com.chaghor.chaghor.worker.dto.OptionResponse;
import com.chaghor.chaghor.worker.dto.WorkerRequest;
import com.chaghor.chaghor.worker.dto.WorkerResponse;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class WorkerService {

    private static final BigDecimal DEFAULT_WAGE = new BigDecimal("170.00");

    private final WorkerRepository workerRepository;
    private final UserRepository userRepository;
    private final ZoneRepository zoneRepository;
    private final PasswordEncoder passwordEncoder;

    // Mirrors SignupRequest and RegisterRequest. Duplicated as a compiled
    // Pattern rather than re-validated through a DTO because this path takes a
    // WorkerRequest, not a credential DTO.
    private static final java.util.regex.Pattern STRONG_PASSWORD =
            java.util.regex.Pattern.compile(
                    "^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,72}$");
    private final com.chaghor.chaghor.web.DailyLedgerService dailyLedger;

    // One worker's money day by day. Admin/supervisor view of the SAME
    // computation the worker sees, reachable without a payslip existing.
    //
    // A PROJECTION ONLY. Nothing here writes; loan.repaid and the advance
    // balance move when a payslip is marked Paid, not when this is read.
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> dailyFor(Long workerId,
                                                  java.time.LocalDate from,
                                                  java.time.LocalDate to) {
        Worker w = workerRepository.findById(workerId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "That worker could not be found."));
        java.time.LocalDate end = to != null ? to : java.time.LocalDate.now();
        java.time.LocalDate start = from != null ? from : end.withDayOfMonth(1);
        return dailyLedger.ledger(w, start, end);
    }


    @Transactional(readOnly = true)
    public List<WorkerResponse> list(String q) {
        // Always pass a non-null String: null binds have no SQL type and Postgres
        // infers bytea, breaking lower(?). Empty string matches everyone.
        String query = (q == null || q.isBlank()) ? "" : q.trim();
        // Preload names once to avoid a lookup per row.
        Map<Long, String> zoneNames = new HashMap<>();
        Map<Long, String> userNames = new HashMap<>();
        zoneRepository.findAll().forEach(z -> zoneNames.put(z.getId(), z.getName()));
        userRepository.findAll().forEach(u -> userNames.put(u.getId(), u.getUsername()));
        List<WorkerResponse> out = new ArrayList<>();
        for (Worker w : workerRepository.search(query)) {
            out.add(toResponse(w, zoneNames, userNames));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public WorkerResponse get(Long id) {
        Worker w = workerRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Worker not found"));
        return toResponse(w, null, null);
    }

    @Transactional
    public WorkerResponse create(WorkerRequest req) {
        // Only LIVE workers block a phone number. A retired worker must not stop
        // their number being reused by whoever takes over the handset.
        if (req.phone() != null && !req.phone().isBlank()
                && workerRepository.existsByPhoneAndDeletedAtIsNull(req.phone())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A worker with that phone already exists");
        }
        Long userId = maybeCreateLogin(req);
        Worker w = Worker.builder()
                .userId(userId)
                .fullName(req.fullName())
                .nameBn(blankToNull(req.nameBn()))
                .phone(blankToNull(req.phone()))
                .nationalId(blankToNull(req.nationalId()))
                .dob(req.dob())
                .zoneId(req.zoneId())
                .supervisorId(req.supervisorId())
                .joinDate(req.joinDate())
                .dailyWage(req.dailyWage() != null ? req.dailyWage() : DEFAULT_WAGE)
                .status(hasText(req.status()) ? req.status() : "active")
                .jobRole(hasText(req.jobRole()) ? req.jobRole() : "plucker")
                .build();
        workerRepository.save(w);
        return toResponse(w, null, null);
    }

    @Transactional
    public WorkerResponse update(Long id, WorkerRequest req) {
        Worker w = workerRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Worker not found"));
        w.setFullName(req.fullName());
        w.setNameBn(blankToNull(req.nameBn()));
        w.setPhone(blankToNull(req.phone()));
        w.setNationalId(blankToNull(req.nationalId()));
        w.setDob(req.dob());
        w.setZoneId(req.zoneId());
        w.setSupervisorId(req.supervisorId());
        w.setJoinDate(req.joinDate());
        if (req.dailyWage() != null) {
            w.setDailyWage(req.dailyWage());
        }
        if (hasText(req.status())) {
            w.setStatus(req.status());
        }
        if (hasText(req.jobRole())) {
            w.setJobRole(req.jobRole());
        }
        workerRepository.save(w);
        return toResponse(w, null, null);
    }

    @Transactional
    // Soft delete. The row is kept and stamped, not removed.
    //
    // Two reasons. First, it has to work at all: V14 put RESTRICT foreign keys
    // on payroll, loan and withdrawal_request, so deleteById() on anyone who has
    // ever been paid failed on a database constraint. Second, it has to stay
    // auditable: erasing a worker would orphan every payslip and loan that names
    // them, and this system exists to keep money traceable.
    //
    // After this the worker disappears from the Workforce list and from payroll
    // generation, but their history still resolves to their name.
    public void delete(Long id) {
        Worker w = workerRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Worker not found"));
        if (w.getDeletedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That worker has already been removed.");
        }
        w.setDeletedAt(OffsetDateTime.now());
        workerRepository.save(w);
    }

    @Transactional(readOnly = true)
    public MetaResponse meta() {
        List<OptionResponse> supervisors = userRepository.findByRole(Role.supervisor).stream()
                .map(u -> new OptionResponse(u.getId(), u.getUsername()))
                .toList();
        List<OptionResponse> zones = zoneRepository.findAll().stream()
                .map(z -> new OptionResponse(z.getId(), z.getName() + " (" + z.getCode() + ")"))
                .toList();
        return new MetaResponse(supervisors, zones);
    }

    // Creates the linked worker login account when requested. Password is hashed
    // with the same BCrypt encoder used everywhere else.
    private Long maybeCreateLogin(WorkerRequest req) {
        if (req.createLogin() == null || !req.createLogin()) {
            return null;
        }
        // SAME RULE AS EVERY OTHER ACCOUNT PATH.
        //
        // This is the third place a login can be created, and it was still
        // checking length alone -- so "12345678" was rejected by the sign-up
        // form and the admin form, and accepted here. A rule enforced in two
        // places out of three is not a rule.
        if (!hasText(req.username()) || req.password() == null
                || !STRONG_PASSWORD.matcher(req.password()).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A username is required, and the password must be 8-72 characters "
                            + "with a capital letter, a small letter, a number and a "
                            + "symbol such as ! # or @.");
        }
        if (userRepository.existsByUsernameIgnoreCase(req.username())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That username already exists");
        }
        User u = User.builder()
                // Lower-cased for the same reason as registration: the unique
                // index is case-sensitive, so "Rahim" and "rahim" would be two
                // accounts for one man.
                .username(req.username().trim().toLowerCase(java.util.Locale.ROOT))
                .passwordHash(passwordEncoder.encode(req.password()))
                .role(Role.worker)
                .locale(Locale.en)
                .isActive(true)
                .build();
        userRepository.save(u);
        return u.getId();
    }

    private WorkerResponse toResponse(Worker w, Map<Long, String> zoneNames, Map<Long, String> userNames) {
        String zoneName = null;
        if (w.getZoneId() != null) {
            zoneName = (zoneNames != null)
                    ? zoneNames.get(w.getZoneId())
                    : zoneRepository.findById(w.getZoneId()).map(Zone::getName).orElse(null);
        }
        String supervisorName = resolveUsername(w.getSupervisorId(), userNames);
        String username = resolveUsername(w.getUserId(), userNames);
        return new WorkerResponse(
                w.getId(), w.getFullName(), w.getNameBn(), w.getPhone(), w.getNationalId(), w.getDob(),
                w.getZoneId(), zoneName, w.getSupervisorId(), supervisorName, w.getJoinDate(),
                w.getDailyWage(), w.getStatus(), w.getJobRole(), w.getPhotoUrl(), w.getUserId(), username);
    }

    private String resolveUsername(Long userId, Map<Long, String> userNames) {
        if (userId == null) {
            return null;
        }
        return (userNames != null)
                ? userNames.get(userId)
                : userRepository.findById(userId).map(User::getUsername).orElse(null);
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static String blankToNull(String s) {
        return hasText(s) ? s : null;
    }
}
