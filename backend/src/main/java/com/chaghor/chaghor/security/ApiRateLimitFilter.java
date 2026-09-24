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
 * A ceiling on ALL authenticated API traffic, not just the login form.
 *
 * <h2>Why this exists</h2>
 *
 * {@link LoginRateLimitFilter} guards three endpoints out of 163. Everything
 * else was unthrottled, so any signed-in account could hammer the API in a loop
 * — deliberately or through a runaway retry in the offline outbox — and starve
 * the connection pool for every other user. On a payroll system that means a
 * supervisor cannot save a register because someone left a tab open.
 *
 * <h2>Deliberately generous</h2>
 *
 * {@value #MAX_REQUESTS} requests a minute is far above anything the UI does.
 * The Finance page issues five calls on load; a supervisor marking 200 workers
 * sends one bulk request. This is a runaway-loop and scraping guard, not a
 * throttle users should ever feel — a limit tight enough to interfere would be
 * worse than no limit at all, because the failure mode is a save that vanishes.
 *
 * <h2>Keyed by user, falling back to address</h2>
 *
 * The JWT subject is the natural key: it survives a phone changing wifi, and it
 * does not lump an entire office behind one NAT address into a single bucket —
 * which would let one busy admin lock out everybody else in the room.
 * Unauthenticated requests fall back to the socket address.
 */
public class ApiRateLimitFilter extends OncePerRequestFilter {

    private static final int MAX_REQUESTS = 300;
    private static final long WINDOW_SECONDS = 60;
    private static final int SWEEP_THRESHOLD = 5_000;

    // Auth endpoints have their own, much stricter, filter. Counting them twice
    // would mean a genuine 429 from the login limiter also consumed the general
    // allowance, so a locked-out user would then be locked out of everything.
    private static final Set<String> HANDLED_ELSEWHERE = Set.of(
            "/api/v1/auth/login",
            "/api/v1/auth/login/pin",
            "/api/v1/auth/signup");

    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, Window> buckets = new ConcurrentHashMap<>();

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
        if (path == null
                || !path.startsWith("/api/v1/")
                || HANDLED_ELSEWHERE.contains(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        long now = Instant.now().getEpochSecond();
        if (buckets.size() > SWEEP_THRESHOLD) {
            buckets.entrySet().removeIf(e -> {
                Window w = e.getValue();
                synchronized (w) {
                    return now - w.windowStartEpoch >= WINDOW_SECONDS;
                }
            });
        }

        Window w = buckets.computeIfAbsent(clientKey(request), k -> {
            Window nw = new Window();
            nw.windowStartEpoch = now;
            return nw;
        });

        boolean over;
        long retryAfter = 1;
        // Short critical section: the downstream chain is NOT called while
        // holding this lock, or every request from one user would serialise.
        synchronized (w) {
            if (now - w.windowStartEpoch >= WINDOW_SECONDS) {
                w.windowStartEpoch = now;
                w.count = 0;
            }
            w.count++;
            over = w.count > MAX_REQUESTS;
            if (over) {
                retryAfter = Math.max(WINDOW_SECONDS - (now - w.windowStartEpoch), 1);
            }
        }

        if (!over) {
            filterChain.doFilter(request, response);
            return;
        }

        response.setStatus(429);
        response.setContentType("application/json");
        response.setHeader("Retry-After", String.valueOf(retryAfter));
        mapper.writeValue(response.getWriter(), Map.of(
                "error", "Too many requests. Please wait a moment and try again.",
                "retryAfterSeconds", retryAfter));
    }

    // The JWT subject where there is one, so the key follows the person rather
    // than the network they happen to be on.
    //
    // Read from the SecurityContext, which JwtAuthFilter has already populated
    // by the time this runs — see the filter order in SecurityConfig.
    private String clientKey(HttpServletRequest req) {
        var auth = org.springframework.security.core.context.SecurityContextHolder
                .getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && auth.getName() != null
                && !"anonymousUser".equals(auth.getName())) {
            return "u:" + auth.getName();
        }
        String peer = req.getRemoteAddr();
        return "ip:" + (peer == null ? "unknown" : peer);
    }
}
