package com.chaghor.chaghor.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Throttles brute-force login attempts: {@value #MAX_ATTEMPTS} per
 * {@value #WINDOW_SECONDS} seconds per client.
 *
 * <h2>Why the client is identified the way it is</h2>
 *
 * This filter used to read {@code X-Forwarded-For} unconditionally:
 *
 * <pre>
 *   String xff = req.getHeader("X-Forwarded-For");
 *   if (xff != null &amp;&amp; !xff.isBlank()) return xff.split(",")[0].trim();
 * </pre>
 *
 * <p>That header is set by the CALLER. Nothing in this application put it
 * there, and with no reverse proxy in front to overwrite it, an attacker sends
 * a different value on every request, lands in a fresh bucket each time, and
 * the limit never triggers. The protection read as though it worked and did
 * nothing at all.
 *
 * <p>The header is now honoured ONLY when the immediate peer
 * ({@code getRemoteAddr}) is a proxy the operator has explicitly listed in
 * {@code app.security.trusted-proxies}. With no proxy configured -- the default,
 * and how this runs today -- the socket address is the only thing trusted, and
 * it cannot be forged over TCP.
 *
 * <h2>Successful logins clear the counter</h2>
 *
 * A worker who mistypes twice and then signs in correctly should not be three
 * attempts closer to a lockout for the rest of the minute. Only failures
 * accumulate.
 *
 * <h2>Memory</h2>
 *
 * Expired windows are swept opportunistically. Without that the map grows one
 * entry per distinct source address forever, which is its own denial of
 * service on a long-running estate server.
 */
public class LoginRateLimitFilter extends OncePerRequestFilter {

    // Both unauthenticated POST endpoints. Signup is throttled for different
    // reasons than login -- not password guessing, but flooding the approval
    // queue with junk, and probing which usernames already exist by timing or
    // by watching for a slower response.
    private static final Set<String> LIMITED_PATHS = Set.of(
            "/api/v1/auth/login",
            "/api/v1/auth/login/pin",
            "/api/v1/auth/signup");

    private static final int MAX_ATTEMPTS = 5;
    private static final long WINDOW_SECONDS = 60;

    // Sweep when the map grows past this, so a burst of unique addresses cannot
    // accumulate unbounded. Cheap: it only runs on a login request.
    private static final int SWEEP_THRESHOLD = 1_000;

    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, Window> buckets = new ConcurrentHashMap<>();

    // Addresses permitted to speak for someone else via X-Forwarded-For.
    // Empty by default: trust nothing but the socket.
    private final Set<String> trustedProxies;

    public LoginRateLimitFilter() {
        this(Set.of());
    }

    public LoginRateLimitFilter(Set<String> trustedProxies) {
        // An unset `app.security.trusted-proxies:` binds to an array holding a
        // single empty string, not an empty array. Left in, that would put ""
        // in the trust set -- harmless today because getRemoteAddr never
        // returns "", but exactly the kind of thing that stops being harmless
        // later. Filtered rather than relied upon.
        this.trustedProxies = (trustedProxies == null)
                ? Set.of()
                : trustedProxies.stream()
                        .filter(p -> p != null && !p.isBlank())
                        .map(String::trim)
                        .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    private static final class Window {
        long windowStartEpoch;
        int count;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();
        boolean limited = LIMITED_PATHS.contains(path)
                && "POST".equalsIgnoreCase(request.getMethod());
        if (!limited) {
            filterChain.doFilter(request, response);
            return;
        }

        // KEYED BY PATH TOO. Sharing one bucket would mean five signup attempts
        // locked the same person out of logging in, which is a denial of service
        // an attacker could aim at a specific office.
        String key = path + "|" + clientKey(request);
        long now = Instant.now().getEpochSecond();

        if (buckets.size() > SWEEP_THRESHOLD) {
            sweep(now);
        }

        Window w = buckets.computeIfAbsent(key, k -> {
            Window nw = new Window();
            nw.windowStartEpoch = now;
            return nw;
        });

        long retryAfter;
        // SHORT CRITICAL SECTION. The previous version called
        // filterChain.doFilter INSIDE this block, which held the lock across
        // password hashing and the database round-trip -- serialising every
        // login from the same address behind one BCrypt verification.
        synchronized (w) {
            if (now - w.windowStartEpoch >= WINDOW_SECONDS) {
                w.windowStartEpoch = now;
                w.count = 0;
            }
            w.count++;
            if (w.count <= MAX_ATTEMPTS) {
                retryAfter = -1;
            } else {
                retryAfter = Math.max(WINDOW_SECONDS - (now - w.windowStartEpoch), 1);
            }
        }

        if (retryAfter < 0) {
            filterChain.doFilter(request, response);
            // Authenticated, so this was not an attack. Clear the counter rather
            // than letting a couple of typos count against a legitimate user for
            // the rest of the window.
            if (response.getStatus() < 400) {
                buckets.remove(key);
            }
            return;
        }

        response.setStatus(429); // 429 Too Many Requests
        response.setContentType("application/json");
        response.setHeader("Retry-After", String.valueOf(retryAfter));
        mapper.writeValue(response.getWriter(), Map.of(
                "error", path.endsWith("/signup")
                        ? "Too many account requests. Please try again in a minute."
                        : path.endsWith("/pin")
                        // Bangla: the only people using PIN sign-in are workers.
                        ? "অনেকবার চেষ্টা হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।"
                        : "Too many login attempts. Please try again later.",
                "retryAfterSeconds", retryAfter));
    }

    private void sweep(long now) {
        buckets.entrySet().removeIf(e -> {
            Window w = e.getValue();
            synchronized (w) {
                return now - w.windowStartEpoch >= WINDOW_SECONDS;
            }
        });
    }

    // Who to count this attempt against.
    //
    // getRemoteAddr is the TCP peer and cannot be spoofed on a completed
    // connection. X-Forwarded-For is just a request header and can say anything,
    // so it is only believed when the peer is a proxy the operator has named.
    private String clientKey(HttpServletRequest req) {
        String peer = req.getRemoteAddr();
        if (peer != null && trustedProxies.contains(peer)) {
            String xff = req.getHeader("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) {
                // Left-most entry is the original client as recorded by the
                // first proxy in the chain.
                String first = xff.split(",")[0].trim();
                if (!first.isEmpty()) {
                    return first;
                }
            }
        }
        return peer == null ? "unknown" : peer;
    }
}
