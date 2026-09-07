package com.chaghor.chaghor.supply;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// The single estate-warehouse marker shown on the Supply Chain live map. Kept as
// one editable row (id = 1) so an admin can relocate the warehouse from the app
// instead of editing application.yml + restarting. Seeded by V11 from the
// app.warehouse.* config defaults.
@Entity
@Table(name = "warehouse")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Warehouse {

    @Id
    private Long id;

    @Column(name = "name", nullable = false, length = 120)
    @Builder.Default
    private String name = "";

    @Column(name = "lat", nullable = false, precision = 9, scale = 6)
    private BigDecimal lat;

    @Column(name = "lng", nullable = false, precision = 9, scale = 6)
    private BigDecimal lng;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    @PreUpdate
    void touch() {
        this.updatedAt = OffsetDateTime.now();
    }
}
