package com.chaghor.chaghor.supply;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

// Publishes live "something changed" signals to every open Supply board over
// the /ws/supply WebSocket. We deliberately push a tiny signal (not the full
// data) and let the frontend re-fetch the affected slice; that keeps the
// payload trivial, avoids duplicating DTO shapes over two transports, and still
// updates the UI within a fraction of a second.
//
// scope tells the client how much to refresh:
//   "location" - a driver GPS ping: refresh KPIs + shipments so the truck moves.
//   "board"    - a dispatch/edit/status/delete/warehouse change: refresh the
//                whole board including the sales ledger.
@Service
public class SupplyEvents {

    private final SupplySocketHandler socketHandler;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SupplyEvents(SupplySocketHandler socketHandler) {
        this.socketHandler = socketHandler;
    }

    // A shipment/warehouse mutation -> refresh the entire board.
    public void boardChanged() {
        emit("board");
    }

    // A driver GPS ping -> refresh live positions + KPIs only.
    public void locationChanged() {
        emit("location");
    }

    private void emit(String scope) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("channel", "supply");
        payload.put("scope", scope);
        payload.put("ts", Instant.now().toString());
        try {
            socketHandler.broadcast(objectMapper.writeValueAsString(payload));
        } catch (Exception ignored) {
            // serialization of this simple map should never fail; never let a
            // broadcast problem break the underlying REST mutation
        }
    }
}
