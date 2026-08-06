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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * In-memory, fixed-window rate limiter for the login endpoint ONLY.
 *
 * Blocks brute-force / credential-stuffing by capping attempts per client IP
 * inside a rolling window. It is dependency-free on purpose (no bucket4j /
 * Maven coordinate / network needed for the build). If you prefer bucket4j,
 * see PHASE1_APPLY_GUIDE.md for the drop-in swap.
 *
 * NOTE: instantiate this in SecurityConfig via addFilterBefore(...). It is NOT
 * a @Component, so Spring Boot will not also auto-register it as a global
 * servlet filter (which would double-count requests).
 */
public class LoginRateLimitFilter extends OncePerRequestFilter {

    private static final String LOGIN_PATH = "/api/v1/auth/login";
    private static final int MAX_ATTEMPTS = 5;
    private static final long WINDOW_SECONDS = 60;

    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, Window> buckets = new ConcurrentHashMap<>();

    private static final class Window {
        long windowStartEpoch;
        final AtomicInteger count = new AtomicInteger(0);
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        boolean isLogin = LOGIN_PATH.equals(request.getRequestURI())
                && "POST".equalsIgnoreCase(request.getMethod());
        if (!isLogin) {
            filterChain.doFilter(request, response);
            return;
        }

        String key = clientIp(request);
        long now = Instant.now().getEpochSecond();
        Window w = buckets.computeIfAbsent(key, k -> {
            Window nw = new Window();
            nw.windowStartEpoch = now;
            return nw;
        });

        long retryAfter;
        synchronized (w) {
            if (now - w.windowStartEpoch >= WINDOW_SECONDS) {
                w.windowStartEpoch = now;
                w.count.set(0);
            }
            int attempts = w.count.incrementAndGet();
            if (attempts <= MAX_ATTEMPTS) {
                filterChain.doFilter(request, response);
                return;
            }
            retryAfter = Math.max(WINDOW_SECONDS - (now - w.windowStartEpoch), 1);
        }

        response.setStatus(429); // 429 Too Many Requests
        response.setContentType("application/json");
        response.setHeader("Retry-After", String.valueOf(retryAfter));
        mapper.writeValue(response.getWriter(), Map.of(
                "error", "Too many login attempts. Please try again later.",
                "retryAfterSeconds", retryAfter));
    }

    private String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return req.getRemoteAddr();
    }
}
