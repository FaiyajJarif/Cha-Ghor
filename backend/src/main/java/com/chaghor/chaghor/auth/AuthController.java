package com.chaghor.chaghor.auth;

import com.chaghor.chaghor.auth.dto.AuthResponse;
import com.chaghor.chaghor.auth.dto.LoginRequest;
import com.chaghor.chaghor.auth.dto.RegisterRequest;
import com.chaghor.chaghor.auth.dto.UserResponse;
import com.chaghor.chaghor.security.JwtService;
import com.chaghor.chaghor.user.Locale;
import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest req) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(req.username(), req.password()));
        User user = userRepository.findByUsername(req.username()).orElseThrow();
        String token = jwtService.generateToken(user.getUsername(), user.getRole().name());
        return ResponseEntity.ok(new AuthResponse(token, user.getUsername(), user.getRole().name()));
    }

    // Admin-only: create supervisor / worker / admin accounts. Needs a valid ADMIN JWT.
    @PostMapping("/register")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest req) {
        if (userRepository.existsByUsername(req.username())) {
            return ResponseEntity.badRequest().build();
        }
        User user = User.builder()
                .username(req.username())
                .email(req.email())
                .passwordHash(passwordEncoder.encode(req.password()))
                .role(req.role())
                .locale(Locale.en)
                .isActive(true)
                .build();
        userRepository.save(user);
        return ResponseEntity.ok(UserResponse.from(user));
    }
}
