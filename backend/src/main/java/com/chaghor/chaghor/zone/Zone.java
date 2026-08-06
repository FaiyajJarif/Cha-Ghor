package com.chaghor.chaghor.zone;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

// Maps to the existing `zones` table. We only map the columns the admin UI
// needs right now (id, name, code, area, daily target); JPA `validate` only
// checks that mapped columns exist, so leaving polygon_geojson unmapped is fine.
@Entity
@Table(name = "zones")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Zone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, unique = true, length = 40)
    private String code;

    @Column(name = "area_hectare")
    private BigDecimal areaHectare;

    @Column(name = "target_kg_per_day")
    private BigDecimal targetKgPerDay;
}
