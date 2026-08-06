package com.chaghor.chaghor.supply;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ShipmentRepository extends JpaRepository<Shipment, Long> {
    List<Shipment> findAllByOrderByCreatedAtDesc();

    // Public driver-tracking lookup by the unguessable per-shipment token.
    Optional<Shipment> findByTrackToken(String trackToken);
}
