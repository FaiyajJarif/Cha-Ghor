package com.chaghor.chaghor.inventory;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;

// A supervisor's request to draw stock, shown in the "Pending Approvals" panel.
// Admins approve / hold / reject it. Kept intentionally simple (free-text label
// + requester + detail) so it matches the reference design without coupling to
// the worker / zone tables yet.
@Entity
@Table(name = "requisition")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Requisition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // e.g. "Gloves (20 Pairs)".
    @Column(name = "item_label", nullable = false, length = 160)
    private String itemLabel;

    // e.g. "S. Kumar".
    @Column(name = "requester", nullable = false, length = 120)
    private String requester;

    // e.g. "Section 7 • Plucking Team".
    @Column(name = "detail", length = 160)
    private String detail;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private RequisitionStatus status = RequisitionStatus.PENDING;

    @Column(name = "requested_at", nullable = false)
    @Builder.Default
    private OffsetDateTime requestedAt = OffsetDateTime.now();

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "decided_by")
    private Long decidedBy;
}
