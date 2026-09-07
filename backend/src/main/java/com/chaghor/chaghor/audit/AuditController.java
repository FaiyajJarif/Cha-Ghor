package com.chaghor.chaghor.audit;

import com.chaghor.chaghor.audit.dto.AuditEntryResponse;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Read-only view of the audit trail. Admin only -- it names who did what.
//
// There is deliberately no POST, PUT or DELETE: audit_log is append-only, and
// the only thing that writes to it is AuditService, from inside the money
// transitions themselves. An audit trail an admin can edit is not one.
@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {

    private static final int MAX_SIZE = 200;

    private final AuditLogRepository repo;

    public AuditController(AuditLogRepository repo) {
        this.repo = repo;
    }

    // Newest first. Optionally narrowed to one record, e.g.
    // /audit?entityType=payroll&entityId=12 -> everything that happened to that payslip.
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<AuditEntryResponse> list(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) Long entityId,
            @RequestParam(defaultValue = "50") int size) {

        int capped = Math.max(1, Math.min(size, MAX_SIZE));

        if (entityType != null && !entityType.isBlank() && entityId != null) {
            return repo.findByEntityTypeAndEntityIdOrderByIdDesc(entityType.trim(), entityId)
                    .stream().map(AuditEntryResponse::from).toList();
        }
        return repo.findAllByOrderByIdDesc(PageRequest.of(0, capped))
                .getContent().stream().map(AuditEntryResponse::from).toList();
    }
}
