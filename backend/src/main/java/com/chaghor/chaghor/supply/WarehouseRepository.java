package com.chaghor.chaghor.supply;

import org.springframework.data.jpa.repository.JpaRepository;

// Single-row repository for the editable warehouse marker (id = 1).
public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {
}
