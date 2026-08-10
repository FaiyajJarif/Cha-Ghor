package com.chaghor.chaghor.harvest;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// Planned work on a field: pluck this block on Thursday, prune that one next
// week.
//
// The `harvest_schedule` table has existed since V1 and had no Java behind it
// until now. The Fields board had a "Create Harvest Schedule" form that built
// objects in React state and lost them on reload, which meant a supervisor
// could plan a week's work, close the tab, and have it silently disappear.
//
// V28 widened the table to match what that form actually collects, and added
// the two things it was missing: a worker to do the job and a proper date.
//
// FOREIGN KEYS ARE PLAIN Long, NOT JPA RELATIONS. Every module in this codebase
// resolves names in the service layer instead (workerMap(), zoneMap()). Adding
// @ManyToOne here would make this the one entity that lazily loads a Zone and
// would drag a Hibernate session requirement into every caller.
@Entity
@Table(name = "harvest_schedule")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HarvestSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "zone_id", nullable = false)
    private Long zoneId;

    // The day the work is planned for. NOT NULL since V1 -- and the reason the
    // old form could never have been saved, because it collected no date at all.
    @Column(name = "sched_date", nullable = false)
    private LocalDate schedDate;

    // Short title: "Second flush pluck", "Prune block 4". V1 named the column
    // `task`; it is the form's "title" field.
    @Column(name = "task", length = 160)
    private String task;

    // The supervisor who OWNS the schedule -- who is answerable for it happening.
    @Column(name = "supervisor_id")
    private Long supervisorId;

    // The worker ASSIGNED to do it. Added in V28. Previously the form let a
    // supervisor type a name into a free-text datalist, which stored an
    // unverifiable string: a typo produced a schedule assigned to nobody, and
    // nothing downstream could tell. Same failure shape as loan.worker_name.
    // Nullable, because plenty of work is planned before anyone is assigned.
    @Column(name = "worker_id")
    private Long workerId;

    // draft | planned | done | cancelled.
    //
    // V1 made this a native enum with only ('planned','done'), so the form's
    // 'draft' would have thrown `invalid input value for enum schedule_status`.
    // V28 converted it to VARCHAR + CHECK, following the rule V23 wrote down
    // after the same class of bug had cost time three times.
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "planned";

    // daily | weekly | one-off | maintenance. Lowercase on the wire and in the
    // column; the UI capitalises for display only.
    @Column(name = "sched_type", nullable = false, length = 20)
    @Builder.Default
    private String schedType = "one-off";

    // What the supervisor expects to come off this field, in kg. A plan, never
    // a wage input -- payroll reads leaf_collection and nothing else.
    @Column(name = "expected_kg")
    private BigDecimal expectedKg;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    // Stored through the same attachment service complaint evidence uses.
    @Column(name = "attachment_url", length = 400)
    private String attachmentUrl;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private OffsetDateTime createdAt = OffsetDateTime.now();

    // Set when the status moves to done, so "when was this actually finished"
    // is answerable without reading the audit log.
    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    // Idempotency key for offline creates (V29).
    //
    // Every other write on the Fields board is naturally "last write wins" --
    // move a field, resize it, mark a job done -- so replaying one twice is
    // harmless. Creating a schedule is not: a replayed POST would put two
    // identical jobs on the board with nothing to say which was meant. The
    // handset assigns this before queueing, and create() returns the existing
    // row when it sees the key again.
    @Column(name = "client_uuid")
    private java.util.UUID clientUuid;
}
