package com.chaghor.chaghor.web;

import com.chaghor.chaghor.auth.dto.UserResponse;
import com.chaghor.chaghor.security.AppUserDetails;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class MeController {

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal AppUserDetails principal) {
        return UserResponse.from(principal.getUser());
    }

    // proves RBAC works
    @GetMapping("/admin/ping")
    @PreAuthorize("hasRole('ADMIN')")
    public String adminPing() {
        return "pong from admin area";
    }

    @GetMapping("/supervisor/ping")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public String supervisorPing() {
        return "pong from supervisor area";
    }

    @GetMapping("/worker/ping")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR','WORKER')")
    public String workerPing() {
        return "pong from worker area";
    }
}
