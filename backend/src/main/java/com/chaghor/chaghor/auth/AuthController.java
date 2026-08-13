package com.chaghor.chaghor.auth;

import com.chaghor.chaghor.auth.dto.AuthResponse;
import com.chaghor.chaghor.auth.dto.LoginRequest;
import com.chaghor.chaghor.auth.dto.PendingAccountResponse;
import com.chaghor.chaghor.auth.dto.PinLoginRequest;
import com.chaghor.chaghor.auth.dto.RegisterRequest;
import com.chaghor.chaghor.auth.dto.SignupRequest;
import com.chaghor.chaghor.auth.dto.UserResponse;
import com.chaghor.chaghor.security.JwtService;
import com.chaghor.chaghor.user.ApprovalStatus;
import com.chaghor.chaghor.user.Locale;
import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AccountRequestService accountRequests;
    private final PinService pinService;

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest req) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(req.username(), req.password()));
        } catch (DisabledException e) {
            // ============================================================
            // VERIFY THE PASSWORD OURSELVES BEFORE SAYING ANYTHING.
            // ============================================================
            //
            // Spring's DaoAuthenticationProvider runs preAuthenticationChecks --
            // which is where isEnabled() lives -- BEFORE it compares passwords.
            // So this catch fires for a disabled account whether the password
            // was right or completely wrong.
            //
            // Explaining "your request is pending" at this point would therefore
            // answer an attacker who supplied no password at all, handing them a
            // way to discover which usernames exist and what state they are in.
            //
            // So the password is checked here explicitly. Only someone who has
            // proved they own the account learns why they cannot get in;
            // everyone else gets the same generic failure as a bad password.
            User u = userRepository.findByUsernameIgnoreCase(req.username()).orElse(null);
            boolean provedOwnership = u != null
                    && passwordEncoder.matches(req.password(), u.getPasswordHash());
            if (!provedOwnership) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Invalid username or password.");
            }

            String status = u.getApprovalStatus();
            if (ApprovalStatus.PENDING.equals(status)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Your account request is still waiting for the estate office "
                                + "to approve it. You will be able to sign in once it is.");
            }
            if (ApprovalStatus.REJECTED.equals(status)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "This account request was not approved. Please speak to the "
                                + "estate office.");
            }
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "This account has been deactivated. Please speak to the estate office.");
        }
        // IgnoreCase to match the authentication above. The token is then
        // signed with user.getUsername() -- the CANONICAL stored value -- so
        // every downstream findByUsername(auth.getName()) keeps working.
        User user = userRepository.findByUsernameIgnoreCase(req.username()).orElseThrow();
        String token = jwtService.generateToken(user.getUsername(), user.getRole().name());
        return ResponseEntity.ok(new AuthResponse(token, user.getUsername(), user.getRole().name()));
    }

    // Admin-only: create supervisor / worker / admin accounts. Needs a valid
    // ADMIN JWT.
    //
    // THERE IS NO PUBLIC SELF-REGISTRATION, and that is deliberate. This is a
    // payroll system for a specific estate: the office knows who works there,
    // and an account is how someone gets paid. A stranger being able to create
    // one is not a feature.
    @PostMapping("/register")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest req) {
        String username = req.username() == null ? "" : req.username().trim();
        // Stored lower-case so "Rahim" and "rahim" cannot become two accounts
        // for one person. The unique index is case-SENSITIVE, so without this
        // the database would happily accept both.
        String normalised = username.toLowerCase(java.util.Locale.ROOT);

        String email = (req.email() == null || req.email().isBlank())
                ? null
                : req.email().trim().toLowerCase(java.util.Locale.ROOT);

        if (userRepository.existsByUsernameIgnoreCase(normalised)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "The username '" + normalised + "' is already taken.");
        }

        User user = User.builder()
                .username(normalised)
                .email(email)
                .passwordHash(passwordEncoder.encode(req.password()))
                .role(req.role())
                .locale(Locale.en)
                .isActive(true)
                .build();
        try {
            userRepository.save(user);
        } catch (DataIntegrityViolationException e) {
            // The exists-check above loses a race, and the email column is
            // UNIQUE too. Relying on the check alone would surface a 500 with a
            // stack trace to an estate clerk who typed a duplicate address.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "That username or email address is already in use.");
        }
        return ResponseEntity.ok(UserResponse.from(user));
    }

    // Sign in with a mobile number and a 4-digit PIN, for workers.
    //
    // WHY NOT A PIN ALONE, which is what "easier to log in" really asks for:
    // four digits is 10,000 combinations across the whole estate, so a bare-PIN
    // login would let a random guess land on SOMEBODY every few dozen tries.
    // The phone number narrows it to one person before the PIN is judged.
    //
    // Rate limited by LoginRateLimitFilter with its own bucket, so PIN guessing
    // cannot also lock a worker out of password sign-in.
    //
    // Deliberately vague on failure. "No account with that number" would let
    // anyone test which phone numbers belong to estate workers.
    @PostMapping("/login/pin")
    public ResponseEntity<AuthResponse> loginWithPin(@Valid @RequestBody PinLoginRequest req) {
        String phone = req.phone().startsWith("+") ? req.phone() : "+" + req.phone();

        // A LIST, because a shared handset means two family members can carry
        // the same number. The PIN decides which of them this is -- PINs are
        // unique estate-wide, so at most one can match.
        List<User> candidates = userRepository.findByPhone(phone);
        User matched = null;
        for (User u : candidates) {
            if (pinService.matches(u, req.pin())) {
                matched = u;
                break;
            }
        }

        if (matched == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "That mobile number and PIN do not match.");
        }
        if (!ApprovalStatus.APPROVED.equals(matched.getApprovalStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Your account request is still waiting for the estate office "
                            + "to approve it.");
        }
        if (!matched.isActive()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "This account has been deactivated. Please speak to the estate office.");
        }

        String token = jwtService.generateToken(matched.getUsername(), matched.getRole().name());
        return ResponseEntity.ok(new AuthResponse(
                token, matched.getUsername(), matched.getRole().name()));
    }

    // ---- self-service account requests --------------------------------------

    // PUBLIC. The only unauthenticated write in the API.
    //
    // Creates a PENDING, INACTIVE account. It grants nothing: no token, no
    // login, no visibility beyond the office's approval queue. Rate limited in
    // SecurityConfig alongside login.
    //
    // Always answers 202 with the same body, whether or not the username was
    // taken. Telling a stranger "that username exists" hands them the first
    // half of a password-guessing campaign.
    @PostMapping("/signup")
    public ResponseEntity<Map<String, String>> signup(@Valid @RequestBody SignupRequest req) {
        accountRequests.signup(req);
        return ResponseEntity.accepted().body(Map.of(
                "status", "pending",
                "message", "Your request has been sent to the estate office. "
                        + "You will be able to sign in once it is approved."));
    }

    // ---- the office's queue --------------------------------------------------

    @GetMapping("/pending")
    @PreAuthorize("hasRole('ADMIN')")
    public List<PendingAccountResponse> pending() {
        return accountRequests.pending();
    }

    // Granting someone access to a payroll system is as consequential as
    // approving a loan, so both are admin-only and both are audited.
    // Body: { "workerId": 12 }  or  { "createWorker": true }
    //
    // For a WORKER request one of those is REQUIRED. The server will not pick a
    // worker record on its own -- it used to match on name, and two people
    // sharing a name meant a coin flip decided whose wages a login could see.
    @PostMapping("/pending/{id}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> approve(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body,
            Principal principal) {
        Long workerId = null;
        boolean createWorker = false;
        if (body != null) {
            Object w = body.get("workerId");
            if (w instanceof Number n) {
                workerId = n.longValue();
            }
            createWorker = Boolean.TRUE.equals(body.get("createWorker"));
        }
        String pin = accountRequests.approve(id, workerId, createWorker,
                principal == null ? null : principal.getName());
        // The ONLY time the plain PIN is ever sent anywhere. Not persisted in
        // readable form, not logged, not repeatable -- if the admin loses it,
        // a new one has to be issued.
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("approved", true);
        out.put("pin", pin);
        return ResponseEntity.ok(out);
    }

    @PostMapping("/pending/{id}/reject")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> reject(@PathVariable Long id,
                                       @RequestBody(required = false) Map<String, String> body,
                                       Principal principal) {
        String reason = (body == null) ? null : body.get("reason");
        accountRequests.reject(id, reason, principal == null ? null : principal.getName());
        return ResponseEntity.noContent().build();
    }
}
