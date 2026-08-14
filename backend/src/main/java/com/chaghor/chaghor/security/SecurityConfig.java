package com.chaghor.chaghor.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final CustomUserDetailsService userDetailsService;

    // Comma-separated allowlist of browser origins permitted to call the API.
    // Override per-environment with APP_CORS_ALLOWED_ORIGINS (e.g. your prod
    // domain). Defaults to the Vite dev server.
    @Value("${app.cors.allowed-origins:http://localhost:5173}")
    private String[] allowedOrigins;

    // Addresses allowed to speak for a client via X-Forwarded-For.
    //
    // EMPTY BY DEFAULT, and that is the safe setting. If you put nginx or a load
    // balancer in front of this, list its address here -- otherwise every login
    // will be counted against the proxy rather than the real client, and one
    // person mistyping a password would lock out the whole estate.
    @Value("${app.security.trusted-proxies:}")
    private String[] trustedProxies;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // Stateless Bearer-token API: no auth cookies are used, so CSRF is
                // not applicable. IF you migrate the JWT into an httpOnly cookie
                // (see PHASE1_APPLY_GUIDE.md), re-enable CSRF for cookie mode.
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {
                })
                // Hardening response headers. Safe for the Bearer/localStorage SPA.
                // X-Content-Type-Options: nosniff is on by default in Spring Security.
                // CSP / Permissions-Policy are intentionally omitted here to avoid
                // breaking Leaflet map tiles and camera/mic/geolocation features -
                // see PHASE1_APPLY_GUIDE.md for an opt-in CSP starter.
                .headers(headers -> headers
                        .frameOptions(fo -> fo.deny())
                        .referrerPolicy(rp -> rp.policy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .httpStrictTransportSecurity(hsts -> hsts
                                .includeSubDomains(true)
                                .maxAgeInSeconds(31536000)))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/auth/login").permitAll()
                        // Self-service account requests. The ONLY unauthenticated
                        // write in the API, and safe because it grants nothing:
                        // the account is created pending and inactive, cannot be
                        // requested as admin, and cannot log in until an admin
                        // approves it. Rate limited below, same as login.
                        .requestMatchers("/api/v1/auth/signup").permitAll()
                        // Worker PIN sign-in. Rate limited like the others.
                        .requestMatchers("/api/v1/auth/login/pin").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        // The notification WebSocket handshake carries no Bearer header
                        // (the browser's native WebSocket API can't set one), so the
                        // handshake endpoint is opened here. The origin is still locked
                        // down in WebSocketConfig.
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/ws/**").permitAll()
                        // Public driver tracking: drivers are not logged-in users, so
                        // the per-shipment token in the URL is the authorization. Both
                        // the tracking view (GET /track/{token}) and the location pings
                        // (POST /track/{token}/location) are opened here.
                        .requestMatchers("/api/v1/supply/track/**").permitAll()
                        .anyRequest().authenticated()
                )
                .authenticationProvider(authenticationProvider())
                // Throttle brute-force login attempts BEFORE the auth logic runs.
                // Instantiated here (not a @Component) so it is only registered in
                // the security chain, never as a global servlet filter.
                .addFilterBefore(
                        new LoginRateLimitFilter(java.util.Set.of(trustedProxies)),
                        UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    // NOT a @Bean, deliberately.
    //
    // This is registered on the filter chain above via
    // .authenticationProvider(authenticationProvider()), which is the only
    // place it is used. Exposing it as a bean AS WELL is what produced:
    //
    //   Global AuthenticationManager configured with an AuthenticationProvider
    //   bean... Consider removing the AuthenticationProvider bean.
    //
    // Spring Security sees an AuthenticationProvider bean in the context and
    // therefore skips wiring the global manager from CustomUserDetailsService.
    // Nothing here depended on that global wiring -- the chain does it
    // explicitly -- so the bean annotation was redundant, and the warning was
    // pointing at real redundancy rather than being noise to silence.
    //
    // Keeping it a plain method removes the warning without changing a single
    // thing about how a login is actually authenticated.
    private DaoAuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.asList(allowedOrigins)); // env-driven allowlist
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
