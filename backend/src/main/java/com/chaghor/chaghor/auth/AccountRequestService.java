package com.chaghor.chaghor.auth;

import com.chaghor.chaghor.audit.AuditService;
import com.chaghor.chaghor.auth.dto.PendingAccountResponse;
import com.chaghor.chaghor.auth.dto.SignupRequest;
import com.chaghor.chaghor.auth.dto.WorkerCandidate;
import com.chaghor.chaghor.notification.NotificationService;
import com.chaghor.chaghor.user.ApprovalStatus;
import com.chaghor.chaghor.user.Locale;
import com.chaghor.chaghor.user.Role;
import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

// Self-service account requests, and the office's decision on them.
//
// ============================================================================
// WHAT THIS OPENS UP, AND WHAT KEEPS IT SAFE
// ============================================================================
//
// POST /auth/signup is the only unauthenticated write in the whole API. That is
// worth being nervous about, so the guarantees are stated here rather than left
// implied:
//
//   1. A REQUEST GRANTS NOTHING. The account is created `pending` and inactive.
//      It cannot log in, cannot hold a token, and appears nowhere except the
//      approval queue until a human decides.
//   2. ADMIN CANNOT BE REQUESTED. SignupRequest.role is a String and only
//      "worker" and "supervisor" map to anything. Posting "admin" is a 400.
//      There is no code path from this endpoint to Role.admin.
//   3. NOTHING IN THE PAYLOAD TOUCHES approval_status. It is not a field on the
//      request and is never read from one.
//   4. THE ENDPOINT IS RATE LIMITED, the same as login, so it cannot be used
//      to flood the queue or to probe which usernames exist.
//
// ============================================================================
// WHY REJECTED ACCOUNTS ARE KEPT
// ============================================================================
// Deleting a rejected request would free the username for immediate reuse and
// erase the fact that someone was turned down. The row stays, holds its
// username, and carries the reason -- so when the person asks the office why,
// there is an answer.
@Service
@RequiredArgsConstructor
public class AccountRequestService {

    private static final Logger log = LoggerFactory.getLogger(AccountRequestService.class);

    private final UserRepository userRepository;
    private final WorkerRepository workerRepository;
    private final ZoneRepository zoneRepository;
    private final PasswordEncoder passwordEncoder;
    private final PinService pinService;
    private final AuditService auditService;
    private final NotificationService notifications;

    // ---- the public request --------------------------------------------------

    @Transactional
    public void signup(SignupRequest req) {
        Role role = requestableRole(req.role());

        String username = req.username().trim().toLowerCase(java.util.Locale.ROOT);
        String email = blankToNull(req.email());
        if (email != null) {
            email = email.trim().toLowerCase(java.util.Locale.ROOT);
        }

        // ====================================================================
        // SAY WHY IT FAILED. A SILENT 202 WAS THE WRONG CALL.
        // ====================================================================
        //
        // This used to return 202 "request sent" on a duplicate and create
        // nothing, to avoid confirming which usernames exist.
        //
        // That protection cost more than it bought. The applicant was told
        // their request was with the office when no request existed -- so they
        // wait, then wait longer, then turn up at the office asking why nobody
        // has approved them, and there is nothing to find. On an estate where
        // an account is how you get paid, a silence that looks like success is
        // worse than telling a stranger that "rahim" is taken.
        //
        // The enumeration risk is real but small here: this is one estate with
        // a known roster, not a public consumer service, and the login path
        // still refuses to say whether a username exists. Signup is also rate
        // limited to 5 a minute, so probing is slow.
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "That username is already taken. Please choose another.");
        }
        if (email != null && userRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An account with that email address already exists.");
        }

        User user = User.builder()
                .username(username)
                .displayName(blankToNull(req.fullName()))
                .email(email)
                .phone(blankToNull(req.phone()))
                .passwordHash(passwordEncoder.encode(req.password()))
                .role(role)
                .locale(Locale.en)
                // BOTH. approvalStatus is the decision; isActive is whether the
                // account works. A pending account is neither decided nor usable.
                .approvalStatus(ApprovalStatus.PENDING)
                .isActive(false)
                .requestedAt(OffsetDateTime.now())
                .build();

        try {
            userRepository.save(user);
        } catch (DataIntegrityViolationException e) {
            // The checks above lost a race with a simultaneous request. Same
            // message, because the applicant's situation is identical.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "That username or email address is already in use.");
        }

        // Tell the office somebody is waiting. Best-effort: a dropped socket
        // frame must not fail a request that has already committed.
        try {
            notifications.send("New account request",
                    (user.getDisplayName() == null ? username : user.getDisplayName())
                            + " has asked for a " + role.name() + " account.",
                    "account.requested", user.getId());
        } catch (Exception ignored) {
            // best-effort by design
        }

        auditService.record("account.requested", "users", user.getId(), null,
                AuditService.details("username", username, "role", role.name()));
    }

    // Only these two. There is no branch that produces Role.admin.
    private Role requestableRole(String raw) {
        String r = raw == null ? "" : raw.trim().toLowerCase(java.util.Locale.ROOT);
        if ("worker".equals(r)) {
            return Role.worker;
        }
        if ("supervisor".equals(r)) {
            return Role.supervisor;
        }
        // Names "admin" explicitly rather than a generic message, because the
        // honest answer to "why was my request refused" is that an admin
        // account is not something anybody can ask for.
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "An account can be requested as a worker or a supervisor. "
                        + "Admin access is granted by an existing admin only.");
    }

    // ---- the office's decision ----------------------------------------------

    @Transactional(readOnly = true)
    public List<PendingAccountResponse> pending() {
        // Every worker record not yet attached to a login. Fetched once for the
        // whole queue rather than per row.
        List<Worker> unlinked = workerRepository.findByDeletedAtIsNull().stream()
                .filter(w -> w.getUserId() == null)
                .toList();
        Map<Long, String> zones = zoneRepository.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(Zone::getId, Zone::getName,
                        (a, b) -> a));

        return userRepository
                .findByApprovalStatusOrderByRequestedAtAsc(ApprovalStatus.PENDING)
                .stream()
                .map(u -> PendingAccountResponse.from(u, candidatesFor(u, unlinked, zones)))
                .toList();
    }

    // Worker records the admin may attach this login to.
    //
    // The name is used ONLY to sort likely matches to the front. It decides
    // nothing -- see approve().
    private List<WorkerCandidate> candidatesFor(User u, List<Worker> unlinked,
                                                Map<Long, String> zones) {
        if (u.getRole() != Role.worker) {
            return List.of();
        }
        String name = u.getDisplayName() == null ? u.getUsername() : u.getDisplayName();
        return unlinked.stream()
                .map(w -> new WorkerCandidate(
                        w.getId(),
                        w.getFullName(),
                        w.getPhone(),
                        w.getZoneId() == null ? null : zones.get(w.getZoneId()),
                        w.getJoinDate() == null ? null : w.getJoinDate().toString(),
                        w.getFullName() != null && w.getFullName().equalsIgnoreCase(name)))
                // Likely matches first, then alphabetical, so a long roster is
                // still usable.
                .sorted(java.util.Comparator
                        .comparing(WorkerCandidate::nameMatches).reversed()
                        .thenComparing(c -> c.fullName() == null ? "" : c.fullName()))
                .toList();
    }

    // `workerId`     - attach the login to THIS worker record, chosen by the admin.
    // `createWorker`  - no existing record fits; make a new one.
    //
    // For a worker request exactly one of them must be supplied. The service
    // will not choose on its own, and that is the whole point of this signature.
    // Returns the worker's new 4-digit PIN, or null for a supervisor.
    //
    // RETURNED, NOT STORED IN READABLE FORM AND NEVER LOGGED. This is the only
    // moment the plain digits exist; the admin reads them off the screen and
    // passes them on. After this response there is no way to recover it, only
    // to issue a new one.
    @Transactional
    public String approve(Long userId, Long workerId, boolean createWorker,
                          String decidedByUsername) {
        User u = require(userId);
        if (!ApprovalStatus.PENDING.equals(u.getApprovalStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That request has already been decided.");
        }

        u.setApprovalStatus(ApprovalStatus.APPROVED);
        u.setActive(true);
        u.setDecidedAt(OffsetDateTime.now());
        u.setDecidedBy(actorId(decidedByUsername));

        // WORKERS GET A PIN. Supervisors do not: they work at a desk with a
        // keyboard, and a short credential is only worth its weakness for
        // someone typing in a field.
        String pin = null;
        if (u.getRole() == Role.worker) {
            pin = pinService.issue(u);
        }
        userRepository.save(u);

        // A WORKER LOGIN WITHOUT A WORKER ROW IS A DEAD ACCOUNT.
        //
        // The whole worker console resolves through workers.user_id: wages,
        // attendance, the daily ledger. Approving a worker and stopping at the
        // users table would produce someone who can sign in and then sees an
        // error on every screen, with nothing to say why.
        if (u.getRole() == Role.worker) {
            attachWorker(u, workerId, createWorker);
        }

        auditService.record("account.approved", "users", u.getId(), null,
                AuditService.details("username", u.getUsername(), "role", u.getRole().name()));

        try {
            // The PIN is deliberately NOT in this message. Notifications are
            // broadcast to open consoles and stored; a credential does not
            // belong in either.
            notifications.send("Account approved",
                    u.getUsername() + " can now sign in.", "account.decided", u.getId());
        } catch (Exception ignored) {
            // best-effort by design
        }
        return pin;
    }

    @Transactional
    public void reject(Long userId, String reason, String decidedByUsername) {
        User u = require(userId);
        if (!ApprovalStatus.PENDING.equals(u.getApprovalStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That request has already been decided.");
        }
        u.setApprovalStatus(ApprovalStatus.REJECTED);
        u.setActive(false);
        u.setDecidedAt(OffsetDateTime.now());
        u.setDecidedBy(actorId(decidedByUsername));
        u.setRejectionReason(blankToNull(reason));
        userRepository.save(u);

        auditService.record("account.rejected", "users", u.getId(), null,
                AuditService.details("username", u.getUsername(),
                        "reason", reason == null ? "" : reason));
    }

    // ---- helpers -------------------------------------------------------------

    // Attach the login to the worker record THE ADMIN PICKED.
    //
    // ========================================================================
    // THIS USED TO MATCH ON NAME, AND THAT WAS A REAL BUG.
    // ========================================================================
    //
    // The previous version searched unlinked workers for one whose full_name
    // equalled the applicant's and took .findFirst(). workers.full_name has no
    // unique constraint -- two people on a Sylhet estate sharing a name is
    // ordinary, not exotic -- and the stream was unordered, so with two "Abdul
    // Karim" rows an arbitrary one won.
    //
    // The consequence was not a cosmetic mislabel. workers.user_id is what the
    // entire worker console resolves through: wages, attendance, the daily
    // ledger, withdrawals. Guessing wrong hands one man the ability to view and
    // draw against another man's pay, silently, with nothing on any screen to
    // show that a guess was ever made.
    //
    // So the server no longer guesses. The admin sees every unlinked worker,
    // with zone and phone and join date to tell same-named people apart, and
    // chooses. A heuristic may sort the list; it may not make the decision.
    private void attachWorker(User u, Long workerId, boolean createWorker) {
        if (workerId != null && createWorker) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Choose either an existing worker record or a new one, not both.");
        }

        if (workerId != null) {
            Worker w = workerRepository.findById(workerId).orElseThrow(() ->
                    new ResponseStatusException(HttpStatus.NOT_FOUND,
                            "That worker record could not be found."));
            if (w.getDeletedAt() != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "That worker record has been removed. Pick another, or create a new one.");
            }
            // A worker already tied to a login must not be re-pointed at a
            // different person -- that is the same wrong-wages failure by
            // another route.
            if (w.getUserId() != null && !w.getUserId().equals(u.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        w.getFullName() + " is already linked to another login.");
            }
            w.setUserId(u.getId());
            workerRepository.save(w);
            log.info("[approve] linked login '{}' to worker #{} (chosen by admin)",
                    u.getUsername(), w.getId());
            return;
        }

        if (!createWorker) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Pick the worker record this login belongs to, or choose to "
                            + "create a new one. Their pay depends on getting this right.");
        }

        // A new record, with NO wage rate. The payroll config default applies
        // until the office sets one deliberately -- inventing a daily wage here
        // would be inventing money.
        Worker w = Worker.builder()
                .fullName(u.getDisplayName() == null ? u.getUsername() : u.getDisplayName())
                .phone(u.getPhone())
                .status("active")
                .userId(u.getId())
                .build();
        workerRepository.save(w);
        log.info("[approve] created worker #{} for login '{}'", w.getId(), u.getUsername());
    }

    private User require(Long id) {
        return userRepository.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "That account request could not be found."));
    }

    private Long actorId(String username) {
        if (username == null) {
            return null;
        }
        return userRepository.findByUsernameIgnoreCase(username).map(User::getId).orElse(null);
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
