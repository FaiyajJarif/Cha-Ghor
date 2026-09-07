package com.chaghor.chaghor.supply;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TeaBatchRepository extends JpaRepository<TeaBatch, Long> {
    List<TeaBatch> findAllByOrderByCreatedAtDesc();
}
