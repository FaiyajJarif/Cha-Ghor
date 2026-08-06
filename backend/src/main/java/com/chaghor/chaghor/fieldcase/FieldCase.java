package com.chaghor.chaghor.fieldcase;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;

// One complaint or field report in the Reports & Complaints inbox. Submitted by
// a worker or supervisor, triaged and answered by an admin. The submitter's
// display name / role / worker code / zone are snapshotted onto the row so the
// inbox reads correctly even if the user record later changes. Evidence is a
// single attachment URL (photo of the field issue). Fresh table with VARCHAR
// enums (@Enumerated(STRING)); response / resolution timestamps back the KPIs.
@Entity
@Table(name = "field_case")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FieldCase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "case_type", nullable = false, length = 20)
    @Builder.Default
    private CaseType caseType = CaseType.COMPLAINT;

    @Column(name = "category", nullable = false, length = 60)
    @Builder.Default
    private String category = "";

    @Column(name = "title", nullable = false, length = 200)
    @Builder.Default
    private String title = "";

    @Column(name = "body", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String body = "";

    @Column(name = "submitter_name", nullable = false, length = 120)
    @Builder.Default
    private String submitterName = "";

    @Column(name = "submitter_role", nullable = false, length = 30)
    @Builder.Default
    private String submitterRole = "";

    @Column(name = "submitted_by")
    private Long submittedBy;

    @Column(name = "worker_code", length = 30)
    private String workerCode;

    @Column(name = "zone", length = 40)
    private String zone;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 20)
    @Builder.Default
    private CasePriority priority = CasePriority.MEDIUM;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private CaseStatus status = CaseStatus.OPEN;

    @Column(name = "evidence_url", columnDefinition = "TEXT")
    private String evidenceUrl;

    @Column(name = "assigned_to")
    private Long assignedTo;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;

    @Column(name = "first_response_at")
    private OffsetDateTime firstResponseAt;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;
}
