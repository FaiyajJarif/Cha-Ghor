package com.chaghor.chaghor.zone;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

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

    // --- field state, added in V23 ------------------------------------------
    // Plain VARCHAR with CHECK constraints rather than native Postgres enums:
    // every native enum in this schema has cost time at some point (lowercase
    // labels, ADD VALUE migrations, views that cannot be re-typed).

    // active | maintenance | resting
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "active";

    // good | caution | poor -- the ground condition a supervisor observed.
    @Column(name = "condition", nullable = false, length = 20)
    @Builder.Default
    private String condition = "good";

    // What they actually saw: "muddy after last night's rain", "pruning until
    // Friday". The condition alone never explains itself.
    @Column(name = "field_note", columnDefinition = "TEXT")
    private String fieldNote;

    // A site photo, stored through the same attachment service the complaint
    // evidence uses -- UUID filenames, magic-byte checks, images only.
    @Column(name = "photo_url", length = 300)
    private String photoUrl;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    // Retired, not deleted (V25). A field with a date here is hidden from every
    // picker, map and board, while every attendance row and leaf weigh-in that
    // ever pointed at it keeps its attribution. Null = live.
    @Column(name = "archived_at")
    private OffsetDateTime archivedAt;
}
