package com.chaghor.chaghor.notification;

import jakarta.validation.Valid;
import com.chaghor.chaghor.notification.dto.NotificationRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    // Admins broadcast a live notification to every open admin console. Handy to
    // demo the bell, and the hook other modules call when something happens.
    @PostMapping("/broadcast")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> broadcast(@Valid @RequestBody NotificationRequest req) {
        return notificationService.send(req.title(), req.body());
    }
}
