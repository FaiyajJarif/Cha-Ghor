package com.chaghor.chaghor.worker;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

// Maps to the existing `workers` table. Foreign keys (user_id, zone_id,
// supervisor_id) are kept as plain Long columns rather than JPA relations to
// keep this slice simple and validate-safe; we resolve names in the service.
@Entity
@Table(name = "workers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Worker {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Linked login account (worker role). Nullable: schema uses ON DELETE SET NULL.
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "full_name", nullable = false, length = 160)
    private String fullName;

    @Column(name = "name_bn", length = 160)
    private String nameBn;

    @Column(length = 20)
    private String phone;

    @Column(name = "national_id", length = 40)
    private String nationalId;

    private LocalDate dob;

    // male | female | other, or null when the office never recorded it (V31).
    // VARCHAR + CHECK, not a native enum, per the rule V23 wrote down. Null is
    // rendered as "records e nei" on the worker's own profile rather than
    // guessed -- that page is the one a worker is most likely to read closely
    // and least able to get corrected.
    @Column(name = "gender", length = 10)
    private String gender;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "supervisor_id")
    private Long supervisorId;

    @Column(name = "join_date")
    private LocalDate joinDate;

    @Column(name = "daily_wage", nullable = false)
    @Builder.Default
    private BigDecimal dailyWage = new BigDecimal("170.00");

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "active";

    // Job role: plucker, maintenance, sprayer, weeder, factory, other (V2 column).
    @Column(name = "job_role", nullable = false, length = 30)
    @Builder.Default
    private String jobRole = "plucker";

    @Column(name = "photo_url", length = 300)
    private String photoUrl;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;

    // Soft delete (column added in V15, wired here).
    //
    // NULL  = a live worker.
    // set   = retired; hidden from every list, but the row survives so their
    //         payslips, loans and withdrawals still resolve to a real name.
    //
    // This is not tidiness. V14 put RESTRICT foreign keys on payroll, loan and
    // withdrawal_request, so a hard DELETE of anyone who has ever been paid
    // fails on a constraint. Stamping this column is what lets an estate retire
    // a worker at all, without erasing the wage history that has to be
    // auditable.
    //
    // SCOPE NOTE: V15 added deleted_at to five tables -- workers, loan, payroll,
    // finance_ledger and withdrawal_request. Only THIS one is wired. The other
    // four have no delete endpoint, so nothing can ever set their column;
    // filtering their queries would be pure risk against the money rollups for
    // no behavioural change (finance_ledger alone has 10 native queries and 16
    // repository methods). If one of those tables ever gains a delete, wire it
    // then -- and filter view_finance / view_loan / view_payroll at the same
    // time, or Cha Bot will disagree with the Finance page. Until then, those
    // rows are protected by V14's RESTRICT foreign keys, not by this column.
    @Column(name = "deleted_at")
    private OffsetDateTime deletedAt;
}
