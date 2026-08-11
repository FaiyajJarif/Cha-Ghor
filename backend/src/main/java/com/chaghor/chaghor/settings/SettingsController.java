package com.chaghor.chaghor.settings;

import com.chaghor.chaghor.auth.dto.UserResponse;
import com.chaghor.chaghor.security.AppUserDetails;
import com.chaghor.chaghor.settings.dto.*;
import com.chaghor.chaghor.user.Locale;
import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class SettingsController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AppSettingRepository appSettingRepository;
    private final com.chaghor.chaghor.fieldcase.CaseAttachmentService attachments;

    // ---- Profile ----
    @PutMapping("/me/profile")
    public UserResponse updateProfile(@AuthenticationPrincipal AppUserDetails principal,
                                      @Valid @RequestBody ProfileUpdateRequest req) {
        User user = currentUser(principal);
        if (req.displayName() != null) user.setDisplayName(blankToNull(req.displayName()));
        if (req.phone() != null) user.setPhone(blankToNull(req.phone()));
        if (req.email() != null) user.setEmail(blankToNull(req.email()));
        if (req.avatarUrl() != null) user.setAvatarUrl(blankToNull(req.avatarUrl()));
        if (req.locale() != null && !req.locale().isBlank()) user.setLocale(parseLocale(req.locale()));
        try {
            userRepository.save(user);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That email is already in use.");
        }
        return UserResponse.from(user);
    }

    // ---- Avatar ----

    // Upload a profile picture for ANY signed-in account.
    //
    // `users.avatar_url` has existed since V3 and could only ever be set by
    // PASTING A URL into the admin Settings form -- the comment at the top of
    // that file says so outright ("without a file-storage service"). Nobody has
    // a URL for a photo of themselves, so in practice the field stayed empty
    // and every header showed an initial.
    //
    // Reuses CaseAttachmentService for the same reason the worker photo does:
    // it already validates magic bytes, names files by a UUID it generates, and
    // caps size. A second uploader would be a second place to get that wrong.
    @PostMapping("/me/avatar")
    public UserResponse setAvatar(@AuthenticationPrincipal AppUserDetails principal,
                                  @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        String declared = file == null || file.getContentType() == null
                ? "" : file.getContentType().toLowerCase();
        // Images only. The attachment store also takes PDF and audio, which are
        // valid there and meaningless as a profile picture.
        if (!declared.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Please choose an image file.");
        }
        User user = currentUser(principal);
        user.setAvatarUrl("/api/v1/complaints/attachments/" + attachments.store(file));
        userRepository.save(user);
        return UserResponse.from(user);
    }

    // ---- Password ----
    @PostMapping("/me/password")
    public ResponseEntity<Void> changePassword(@AuthenticationPrincipal AppUserDetails principal,
                                               @Valid @RequestBody PasswordChangeRequest req) {
        User user = currentUser(principal);
        if (!passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your current password is incorrect.");
        }
        if (req.newPassword().length() < 6) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New password must be at least 6 characters.");
        }
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        userRepository.save(user);
        return ResponseEntity.noContent().build();
    }

    // ---- Notifications ----
    @PutMapping("/me/notifications")
    public UserResponse updateNotifications(@AuthenticationPrincipal AppUserDetails principal,
                                            @Valid @RequestBody NotificationPrefsRequest req) {
        User user = currentUser(principal);
        user.setNotifyBroadcast(req.notifyBroadcast());
        user.setNotifyAttendance(req.notifyAttendance());
        user.setNotifyPayroll(req.notifyPayroll());
        userRepository.save(user);
        return UserResponse.from(user);
    }

    // ---- Estate settings ----
    @GetMapping("/settings/estate")
    public EstateSettingsResponse getEstate() {
        return toResponse(loadEstate());
    }

    @PutMapping("/settings/estate")
    @PreAuthorize("hasRole('ADMIN')")
    public EstateSettingsResponse updateEstate(@AuthenticationPrincipal AppUserDetails principal,
                                               @Valid @RequestBody EstateSettingsRequest req) {
        AppSetting s = loadEstate();
        if (req.estateName() != null && !req.estateName().isBlank()) s.setEstateName(req.estateName().trim());
        if (req.currency() != null && !req.currency().isBlank()) s.setCurrency(req.currency().trim());
        s.setLogoUrl(blankToNull(req.logoUrl()));
        s.setUpdatedBy(principal.getUser().getId());
        s.setUpdatedAt(OffsetDateTime.now());
        appSettingRepository.save(s);
        return toResponse(s);
    }

    // ---- helpers ----
    private User currentUser(AppUserDetails principal) {
        return userRepository.findByUsername(principal.getUsername())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Session expired."));
    }

    private AppSetting loadEstate() {
        return appSettingRepository.findById(1L).orElseGet(() ->
                AppSetting.builder().id(1L).estateName("Cha-Ghor Estate").currency("\u09f3")
                        .updatedAt(OffsetDateTime.now()).build());
    }

    private EstateSettingsResponse toResponse(AppSetting s) {
        return new EstateSettingsResponse(s.getEstateName(), s.getLogoUrl(), s.getCurrency());
    }

    private Locale parseLocale(String v) {
        try {
            return Locale.valueOf(v);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown language: " + v);
        }
    }

    private String blankToNull(String v) {
        if (v == null) return null;
        String t = v.trim();
        return t.isEmpty() ? null : t;
    }
}
