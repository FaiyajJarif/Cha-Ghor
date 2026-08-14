package com.chaghor.chaghor.supply;

// Lifecycle of an outbound shipment as it moves from the estate warehouse to the
// buyer. Drives the Live Shipment Tracker stepper and the In Transit / Delivered
// KPIs.
public enum ShipmentStatus {
    LOADING,
    IN_TRANSIT,
    AT_WEIGH_IN,
    DELIVERED
}
