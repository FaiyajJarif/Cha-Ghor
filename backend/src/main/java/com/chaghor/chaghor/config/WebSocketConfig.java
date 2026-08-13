package com.chaghor.chaghor.config;

import com.chaghor.chaghor.notification.NotificationSocketHandler;
import com.chaghor.chaghor.supply.SupplySocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

// Registers the raw WebSocket handlers:
//   /ws/notifications - the header notification bell, the live supervisor
//                        Broadcast page, and the admin leaf/attendance views.
//   /ws/supply        - the live Supply Chain board (KPIs, shipments, map,
//                        sales ledger) so it updates the instant anything
//                        changes instead of waiting for the fallback poll.
// Requires the spring-boot-starter-websocket dependency (see the note in the
// Code Structure page).
//
// ORIGINS COME FROM THE SAME PROPERTY AS THE REST API, deliberately.
// Both were previously configured separately and drifted: SecurityConfig read
// `app.cors.allowed-origins` from the environment while this class hardcoded
// http://localhost:5173. The effect was that opening the app on a phone over
// the LAN (http://192.168.x.x:5173) got a working page whose sockets were
// silently rejected at the handshake -- the supervisor screens showed "Offline"
// and never updated, with nothing in the UI to explain why. The supervisor
// screens are phone-first, so that is exactly where it hurt.
//
// setAllowedOriginPatterns, not setAllowedOrigins, so a wildcard entry can
// cover a LAN whose address changes between sessions:
//     APP_CORS_ALLOWED_ORIGINS=http://localhost:5173,http://192.168.*.*:5173
// A plain origin string is itself a valid pattern, so the default is unchanged.
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final NotificationSocketHandler notificationSocketHandler;
    private final SupplySocketHandler supplySocketHandler;

    @Value("${app.cors.allowed-origins:http://localhost:5173}")
    private String[] allowedOrigins;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(notificationSocketHandler, "/ws/notifications")
                .setAllowedOriginPatterns(allowedOrigins);
        registry.addHandler(supplySocketHandler, "/ws/supply")
                .setAllowedOriginPatterns(allowedOrigins);
    }
}
