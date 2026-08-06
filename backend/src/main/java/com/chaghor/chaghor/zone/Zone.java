package com.chaghor.chaghor.zone;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;

// Maps to the existing `zones` table.
//
// polygon_geojson is now mapped too, so a supervisor can place each field on a
// map. The column has existed since V1 and was simply never used, so this needs
// no migration.
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

    // Where this field actually is, as GeoJSON. A supervisor drops a pin and
    // sets a diameter, which is stored as a Point plus a radius in metres:
    //
    //   {"type":"Feature",
    //    "geometry":{"type":"Point","coordinates":[lng,lat]},
    //    "properties":{"radiusM":250}}
    //
    // A circle rather than a traced polygon on purpose: it is two numbers a
    // supervisor can set on a phone in a field, and it is enough to draw the
    // attendance heatmap. The GeoJSON Feature shape leaves room for a real
    // polygon later without changing the column or the API.
    //
    // Null means "not placed yet", which the map shows as an unplaced field
    // rather than dropping it at coordinates nobody chose.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "polygon_geojson", columnDefinition = "jsonb")
    private String polygonGeojson;
}
