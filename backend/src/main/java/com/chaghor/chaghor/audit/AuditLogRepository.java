package com.chaghor.chaghor.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// audit_log is append-only by design (V15 grants the app role INSERT + SELECT
// only), so there is deliberately no update or delete method here.
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    Page<AuditLog> findAllByOrderByIdDesc(Pageable pageable);

    // "What happened to this payslip / loan / withdrawal?"
    List<AuditLog> findByEntityTypeAndEntityIdOrderByIdDesc(String entityType, Long entityId);
}
