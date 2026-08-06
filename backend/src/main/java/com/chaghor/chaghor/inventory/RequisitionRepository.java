package com.chaghor.chaghor.inventory;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;

public interface RequisitionRepository extends JpaRepository<Requisition, Long> {

    List<Requisition> findByStatusOrderByRequestedAtDesc(RequisitionStatus status);

    long countByStatus(RequisitionStatus status);

    // "Approved issues today" KPI: approved requisitions decided after midnight.
    long countByStatusAndDecidedAtAfter(RequisitionStatus status, OffsetDateTime t);
}
