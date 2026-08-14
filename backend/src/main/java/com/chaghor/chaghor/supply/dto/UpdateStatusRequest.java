package com.chaghor.chaghor.supply.dto;

// Body for PATCH /api/v1/supply/shipments/{id}/status. `status` must be one of
// LOADING, IN_TRANSIT, AT_WEIGH_IN, DELIVERED.
public record UpdateStatusRequest(String status) {}
