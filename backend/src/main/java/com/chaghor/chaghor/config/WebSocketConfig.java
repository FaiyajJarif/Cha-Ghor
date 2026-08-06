package com.chaghor.chaghor.config;

import com.chaghor.chaghor.notification.NotificationSocketHandler;
import com.chaghor.chaghor.supply.SupplySocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

// Registers the raw WebSocket handlers:
//   /ws/notifications - the header notification bell.
//   /ws/supply        - the live Supply Chain board (KPIs, shipments, map,
//                        sales ledger) so it updates the instant anything
//                        changes instead of waiting for the fallback poll.
// Requires the spring-boot-starter-websocket dependency (see the note in the
// Code Structure page).
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final NotificationSocketHandler notificationSocketHandler;
    private final SupplySocketHandler supplySocketHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(notificationSocketHandler, "/ws/notifications")
                .setAllowedOrigins("http://localhost:5173");
        registry.addHandler(supplySocketHandler, "/ws/supply")
                .setAllowedOrigins("http://localhost:5173");
    }
}
