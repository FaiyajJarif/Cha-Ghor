package com.chaghor.chaghor.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

// Builds a notification payload ({id,title,body,ts} — the shape the bell parses)
// and pushes it to every open WebSocket connection.
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationSocketHandler socketHandler;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public Map<String, Object> send(String title, String body) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("title", (title == null || title.isBlank()) ? "Notification" : title);
        payload.put("body", body == null ? "" : body);
        payload.put("ts", Instant.now().toString());
        try {
            socketHandler.broadcast(objectMapper.writeValueAsString(payload));
        } catch (Exception ignored) {
            // serialization of this simple map should never fail
        }
        return payload;
    }
}
