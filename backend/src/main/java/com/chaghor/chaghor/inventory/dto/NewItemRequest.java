package com.chaghor.chaghor.inventory.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

// Payload for POST /inventory/items (admin only).
//
// Only `name` is genuinely required -- InventoryService already rejected a
// blank one by hand, and supplies sensible defaults for unit ("units") and
// site ("Central Hub"), so those must stay optional. The numeric constraints
// stop negative stock, which nothing else was checking.
public record NewItemRequest(
        @NotBlank(message = "Name is required")
        String name,

        String category,
        String codeLabel,
        String codeValue,

        @DecimalMin(value = "0.0", message = "Quantity cannot be negative")
        BigDecimal quantity,

        @DecimalMin(value = "0.0", message = "Capacity cannot be negative")
        BigDecimal capacity,

        String unit,

        @DecimalMin(value = "0.0", message = "Unit value cannot be negative")
        BigDecimal unitValue,

        @DecimalMin(value = "0.0", message = "Reorder level cannot be negative")
        BigDecimal reorderLevel,

        String site
) {}
