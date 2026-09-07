package com.chaghor.chaghor.audit;

import com.chaghor.chaghor.user.User;
import com.chaghor.chaghor.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

// Writes the append-only audit trail (audit_log, V15). Until now the entity
// existed with zero call sites, so nothing was ever audited.
//
// WHO: the actor is read from the Spring security context rather than passed in
// as a parameter. That keeps every service signature unchanged -- several of
// the money transitions (markPaid, withdrawal decide) never received the
// username at all, and threading it through would have touched controllers,
// services and their callers for no functional gain.
//
// WHEN IT FAILS: recording runs in its own transaction (REQUIRES_NEW) and
// swallows its own errors. A failed audit write must never roll back a payment
// that has already happened -- the same reasoning SmsService uses.
//
// That is a deliberate trade-off worth knowing: it means an audit gap is
// possible if the write fails, and you would only see it in the log. If this
// system ever needed a legally strict trail, this should move into the caller's
// transaction so a failed audit aborts the operation. For an estate demo,
// losing a payslip because the audit table was busy is the worse outcome.
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final AuditLogRepository repo;
    private final UserRepository userRepository;
    private final ObjectMapper mapper = new ObjectMapper();

    public AuditService(AuditLogRepository repo, UserRepository userRepository) {
        this.repo = repo;
        this.userRepository = userRepository;
    }

    // A state change on one record. `before` and `after` are small maps of the
    // fields that actually moved -- not the whole entity, so the trail stays
    // readable and holds no more personal data than it needs.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String action, String entityType, Long entityId,
                       Map<String, Object> before, Map<String, Object> after) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String username = (auth == null) ? null : auth.getName();

            Long actorId = null;
            if (username != null) {
                actorId = userRepository.findByUsername(username).map(User::getId).orElse(null);
            }

            String role = null;
            if (auth != null && auth.getAuthorities() != null) {
                role = auth.getAuthorities().stream()
                        .map(GrantedAuthority::getAuthority)
                        .findFirst()
                        .map(a -> a.startsWith("ROLE_") ? a.substring(5) : a)
                        .orElse(null);
            }

            repo.save(AuditLog.builder()
                    .actorUserId(actorId)
                    .actorRole(trimTo(role, 20))
                    .action(trimTo(action, 20))
                    .entityType(trimTo(entityType, 60))
                    .entityId(entityId)
                    .beforeJson(toJson(before))
                    .afterJson(toJson(after))
                    .build());
        } catch (Exception ex) {
            // Never let auditing break the thing being audited.
            log.warn("Audit write failed for {} {} #{}: {}",
                    action, entityType, entityId, ex.toString());
        }
    }

    // Convenience for a plain state transition, which is most of what this
    // system does: draft -> review -> approved -> paid, pending -> paid, etc.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordTransition(String entityType, Long entityId,
                                 String fromStatus, String toStatus,
                                 Map<String, Object> details) {
        Map<String, Object> before = new LinkedHashMap<>();
        before.put("status", fromStatus);
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("status", toStatus);
        if (details != null) {
            after.putAll(details);
        }
        record("UPDATE", entityType, entityId, before, after);
    }

    // Build a details map WITHOUT Map.of, which throws NullPointerException on a
    // null key or value. That matters more than it looks: the map is built at
    // the call site, so the exception would be thrown before record() is even
    // entered, and the try/catch inside could not protect the payment being
    // audited. A null here just means "we do not know that field" -- it is
    // skipped, and the money transition survives.
    public static Map<String, Object> details(Object... keyValuePairs) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (keyValuePairs == null) {
            return m;
        }
        for (int i = 0; i + 1 < keyValuePairs.length; i += 2) {
            Object k = keyValuePairs[i];
            Object v = keyValuePairs[i + 1];
            if (k != null && v != null) {
                m.put(k.toString(), v);
            }
        }
        return m;
    }

    private String toJson(Map<String, Object> m) {
        if (m == null || m.isEmpty()) {
            return null;
        }
        try {
            return mapper.writeValueAsString(m);
        } catch (Exception ex) {
            return null;
        }
    }

    private static String trimTo(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() > max ? s.substring(0, max) : s;
    }
}
