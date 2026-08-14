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
        return send(title, body, null, null);
    }

    // Same push, plus two optional routing fields.
    //
    // `kind` lets a screen tell whether a frame concerns it -- the Broadcast
    // board refreshes on "case.*" and ignores everything else, rather than
    // refetching on every unrelated notification. `refId` is the row the event
    // is about, so a listener can jump straight to it.
    //
    // Both are additive. The bell reads only {id,title,body,ts} and ignores
    // unknown keys, so existing consumers are unaffected.
    public Map<String, Object> send(String title, String body, String kind, Object refId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("title", (title == null || title.isBlank()) ? "Notification" : title);
        payload.put("body", body == null ? "" : body);
        payload.put("ts", Instant.now().toString());
        if (kind != null) {
            payload.put("kind", kind);
        }
        if (refId != null) {
            payload.put("refId", refId);
        }
        try {
            socketHandler.broadcast(objectMapper.writeValueAsString(payload));
        } catch (Exception ignored) {
            // serialization of this simple map should never fail
        }
        return payload;
    }
}
