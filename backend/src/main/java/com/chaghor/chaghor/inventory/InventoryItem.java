package com.chaghor.chaghor.inventory;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One stock line in the estate store (`inventory_item`). Like the finance
// ledger this is a fresh table that stores its enum as a plain VARCHAR, mapped
// with @Enumerated(STRING). Stock level % is derived (quantity / capacity) in
// the service, so it is never stored.
@Entity
@Table(name = "inventory_item")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InventoryItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 20)
    @Builder.Default
    private InventoryCategory category = InventoryCategory.TOOLS;

    // The small line under the item name, e.g. label "Model" + value "Felco 2 Pro".
    @Column(name = "code_label", length = 40)
    private String codeLabel;

    @Column(name = "code_value", length = 80)
    private String codeValue;

    @Column(name = "quantity", nullable = false)
    @Builder.Default
    private BigDecimal quantity = BigDecimal.ZERO;

    // Full/target stock; stock level percentage = quantity / capacity * 100.
    @Column(name = "capacity", nullable = false)
    @Builder.Default
    private BigDecimal capacity = BigDecimal.ZERO;

    @Column(name = "unit", nullable = false, length = 20)
    @Builder.Default
    private String unit = "units";

    // Value per unit, used for the Stock Value KPI (quantity * unitValue).
    @Column(name = "unit_value", nullable = false)
    @Builder.Default
    private BigDecimal unitValue = BigDecimal.ZERO;

    @Column(name = "reorder_level", nullable = false)
    @Builder.Default
    private BigDecimal reorderLevel = BigDecimal.ZERO;

    // Storage site; drives the Distribution donut (Central Hub / Factory / ...).
    @Column(name = "site", nullable = false, length = 40)
    @Builder.Default
    private String site = "Central Hub";

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime createdAt;
}
