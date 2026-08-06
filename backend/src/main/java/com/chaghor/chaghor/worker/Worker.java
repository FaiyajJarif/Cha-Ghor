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
}
