package com.chaghor.chaghor.auth;

import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;

// Issues and checks the 4-digit worker PIN.
//
// ============================================================================
// WHAT A PIN IS AND IS NOT
// ============================================================================
//
// It is a convenience credential for someone who picks tea for a living and
// should not have to type "Abdul#2026" on a cracked phone screen at dawn.
//
// It is NOT a second password. Four digits is 10,000 possibilities, which is
// nothing. Everything below exists to keep that number from mattering:
//
//   * A PIN NEVER IDENTIFIES ANYONE. Login is phone + PIN. The phone says who,
//     the PIN proves it. Accepting a bare PIN would mean a random guess landing
//     on SOMEBODY's account once every 10,000/N attempts.
//   * Attempts are rate limited at the filter, same as password login.
//   * The PIN is BCrypt-hashed. It is displayed to the admin exactly once, at
//     approval, and after that exists nowhere readable -- not in the database,
//     not in a log line.
@Service
@RequiredArgsConstructor
public class PinService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    // SecureRandom, not Random. A PIN generated from a predictable sequence is
    // a PIN an attacker can generate too -- and these are issued in batches as
    // an admin works through the approval queue, which is exactly the pattern
    // that makes a weak generator guessable.
    private static final SecureRandom RANDOM = new SecureRandom();

    // 1000-9999 so every PIN is genuinely four digits. Allowing 0042 would be
    // fine cryptographically but invites a worker to type "42".
    private static final int MIN = 1000;
    private static final int MAX = 9999;

    // With 9000 usable PINs, collisions become common well before exhaustion --
    // the birthday problem, not the pigeonhole one. Retrying is cheap; give up
    // loudly rather than looping forever.
    private static final int MAX_TRIES = 60;

    // Issue a fresh PIN and store only its hashes. Returns the plain digits to
    // the caller ONCE, for showing to the admin.
    public String issue(User user) {
        for (int i = 0; i < MAX_TRIES; i++) {
            String pin = String.valueOf(MIN + RANDOM.nextInt(MAX - MIN + 1));
            String lookup = sha256(pin);
            if (userRepository.existsByPinLookup(lookup)) {
                continue;   // taken by another worker; draw again
            }
            user.setPinHash(passwordEncoder.encode(pin));
            user.setPinLookup(lookup);
            user.setPinSetAt(OffsetDateTime.now());
            return pin;
        }
        // Roughly what this means in practice: the estate has issued so many
        // PINs that 60 consecutive draws all collided. Say so plainly instead
        // of handing out a duplicate or a null.
        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Could not find a free 4-digit PIN. Too many are already in use - "
                        + "clear PINs for workers who have left, or use password sign-in.");
    }

    // Does this PIN belong to this user?
    //
    // Goes through BCrypt, never through pin_lookup. The lookup column is an
    // unsalted SHA-256 of four digits -- a table of all 10,000 takes a moment
    // to build -- so comparing against it would turn a stolen database into a
    // list of everyone's PIN. It exists only to make the unique index possible.
    public boolean matches(User user, String pin) {
        if (user == null || user.getPinHash() == null || pin == null) {
            return false;
        }
        return passwordEncoder.matches(pin, user.getPinHash());
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] out = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(out.length * 2);
            for (byte b : out) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the JDK; if it is missing the platform is
            // broken in a way that guessing around would only hide.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
