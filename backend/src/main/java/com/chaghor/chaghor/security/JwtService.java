package com.chaghor.chaghor.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Service
public class JwtService {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(JwtService.class);

    private final SecretKey key;
    private final long expirationMs;

    // The dev default committed to application.yaml. Anyone who can read this
    // repository can compute it, so a deployment still using it is a deployment
    // where anybody can mint an admin token without a password.
    static final String DEV_SECRET =
            "dev-only-chaghor-secret-a1b2c3d4e5f60718293a4b5c6d7e8f90";

    // HS384 needs 384 bits. Shorter keys make the signature cheaper to attack,
    // and jjwt would reject them at signing time anyway -- better to say so at
    // startup than to discover it on the first login attempt.
    private static final int MIN_SECRET_BYTES = 48;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-ms}") long expirationMs,
            Environment env) {

        // ================================================================
        // REFUSE TO START ON THE SHARED DEV KEY OUTSIDE DEVELOPMENT.
        // ================================================================
        //
        // application.yaml carries a working fallback so a fresh clone runs with
        // no setup, which is genuinely useful and worth keeping. The danger is
        // that the same fallback silently survives into a real deployment: the
        // application boots, logins succeed, everything looks correct, and the
        // signing key is sitting in public git history. Forging an admin token
        // is then a five-line script.
        //
        // A warning in a log nobody reads does not prevent that. Refusing to
        // boot does. The check is on the DEV PROFILE, not on the environment
        // variable, so `./mvnw spring-boot:run` on a laptop is unaffected.
        boolean devProfile = env != null
                && (env.acceptsProfiles(Profiles.of("dev", "local", "test"))
                    || env.getActiveProfiles().length == 0);

        if (DEV_SECRET.equals(secret) && !devProfile) {
            throw new IllegalStateException(
                    "APP_JWT_SECRET is still the built-in development key. "
                    + "Set APP_JWT_SECRET to a private value of at least "
                    + MIN_SECRET_BYTES + " characters before running outside "
                    + "development - the default is published in the source "
                    + "repository and anyone holding it can sign in as an admin.");
        }

        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "APP_JWT_SECRET must be at least " + MIN_SECRET_BYTES
                    + " characters for HS384 signing.");
        }

        if (DEV_SECRET.equals(secret)) {
            // Development, so it boots -- but it says so every time, because the
            // one thing worse than the dev key is forgetting it is in use.
            log.warn("[auth] Using the BUILT-IN DEVELOPMENT JWT key. "
                    + "Never run outside development like this.");
        }

        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    public String generateToken(String username, String role) {
        Date now = new Date();
        Date exp = new Date(now.getTime() + expirationMs);
        return Jwts.builder()
                .subject(username)
                .claim("role", role)
                .issuedAt(now)
                .expiration(exp)
                .signWith(key)
                .compact();
    }

    public String extractUsername(String token) {
        return parse(token).getSubject();
    }

    public boolean isValid(String token, String username) {
        Claims c = parse(token);
        return c.getSubject().equals(username) && c.getExpiration().after(new Date());
    }

    private Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload();
    }
}
