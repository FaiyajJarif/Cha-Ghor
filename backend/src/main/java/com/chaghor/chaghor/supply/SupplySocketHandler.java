package com.chaghor.chaghor.supply;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

// Raw WebSocket handler for the live Supply Chain board, mounted at
// ws://<host>/ws/supply. Mirrors NotificationSocketHandler: the admin board
// uses the browser's native WebSocket API (not STOMP), so we keep every open
// session and push small JSON "refresh" signals to all of them. The frontend
// re-fetches the affected slice the instant it receives a frame, which is what
// makes KPIs, shipments, the map and the sales ledger update live instead of
// waiting for the fallback poll.
//
// Thread-safety: Spring runs each WebSocket callback and each REST request on
// its own container thread, so sessions are held in a CopyOnWriteArraySet and
// each send is guarded by a per-session lock. broadcast() may therefore be
// called concurrently (e.g. two drivers pinging at once) without corrupting a
// session's frame stream.
@Component
public class SupplySocketHandler extends TextWebSocketHandler {

    private final Set<WebSocketSession> sessions = new CopyOnWriteArraySet<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
    }

    // Broadcast a JSON string to every connected supply board.
    public void broadcast(String json) {
        TextMessage message = new TextMessage(json);
        for (WebSocketSession session : sessions) {
            if (!session.isOpen()) {
                continue;
            }
            try {
                synchronized (session) {
                    session.sendMessage(message);
                }
            } catch (IOException ignored) {
                // drop the frame for this session; it is cleaned up on close
            }
        }
    }

    public int openConnections() {
        return sessions.size();
    }
}
