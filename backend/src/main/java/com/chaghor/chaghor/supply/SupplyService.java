package com.chaghor.chaghor.supply;

import com.chaghor.chaghor.supply.dto.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

// Read + dispatch logic for the Supply Chain module. Every KPI and the
// warehouse distribution are rolled up live from the shipment / tea_batch /
// sales tables, so the dashboard always reflects current data.
@Service
public class SupplyService {

    private final ShipmentRepository shipmentRepo;
    private final TeaBatchRepository batchRepo;
    private final SalesTransactionRepository salesRepo;
    private final WarehouseRepository warehouseRepo;

    public SupplyService(ShipmentRepository shipmentRepo, TeaBatchRepository batchRepo,
                         SalesTransactionRepository salesRepo, WarehouseRepository warehouseRepo) {
        this.shipmentRepo = shipmentRepo;
        this.batchRepo = batchRepo;
        this.salesRepo = salesRepo;
        this.warehouseRepo = warehouseRepo;
    }

    private static final long WAREHOUSE_ID = 1L;

    // Estate warehouse geo + name for the live map. Defaults point at the
    // Srimangal central warehouse; override via application.yml (app.warehouse.*).
    @Value("${app.warehouse.name:Chaghor Central Warehouse - Srimangal}")
    private String warehouseName;

    @Value("${app.warehouse.lat:24.3065}")
    private BigDecimal warehouseLat;

    @Value("${app.warehouse.lng:91.7296}")
    private BigDecimal warehouseLng;

    public SupplySummaryResponse summary() {
        List<Shipment> shipments = shipmentRepo.findAll();
        List<TeaBatch> batches = batchRepo.findAll();
        List<SalesTransaction> sales = salesRepo.findAll();

        BigDecimal teaInStock = batches.stream()
                .map(TeaBatch::getWeightKg).filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal inTransit = shipments.stream()
                .filter(s -> s.getStatus() != ShipmentStatus.DELIVERED)
                .map(Shipment::getWeightKg).filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal delivered = shipments.stream()
                .filter(s -> s.getStatus() == ShipmentStatus.DELIVERED)
                .map(Shipment::getWeightKg).filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal volumeSold = sales.stream()
                .map(SalesTransaction::getVolumeKg).filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        long activeShipments = shipments.stream()
                .filter(s -> s.getStatus() != ShipmentStatus.DELIVERED)
                .count();

        long pendingOrders = sales.stream()
                .filter(t -> t.getShipStatus() != ShipStatus.DELIVERED)
                .count();

        return new SupplySummaryResponse(teaInStock, inTransit, delivered, volumeSold, activeShipments, pendingOrders);
    }

    public List<ShipmentResponse> shipments() {
        return shipmentRepo.findAllByOrderByCreatedAtDesc().stream().map(ShipmentResponse::from).toList();
    }

    // Always return the three stages in pipeline order, even when a stage is
    // currently empty, so the bars render consistently.
    public List<StockBucketResponse> stock() {
        List<TeaBatch> all = batchRepo.findAll();
        List<StockBucketResponse> out = new ArrayList<>();
        out.add(bucket(all, BatchStage.READY_FOR_DISPATCH, "Ready for Dispatch"));
        out.add(bucket(all, BatchStage.PROCESSING, "Processed / Sorting"));
        out.add(bucket(all, BatchStage.RAW_LEAF, "Raw Leaf (Withered)"));
        return out;
    }

    private static StockBucketResponse bucket(List<TeaBatch> all, BatchStage stage, String label) {
        BigDecimal sum = all.stream()
                .filter(b -> b.getStage() == stage)
                .map(TeaBatch::getWeightKg).filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new StockBucketResponse(stage.name(), label, sum);
    }

    public List<BatchResponse> batches() {
        return batchRepo.findAllByOrderByCreatedAtDesc().stream().map(BatchResponse::from).toList();
    }

    public PagedSalesResponse sales(int page, int size) {
        int p = Math.max(0, page);
        int s = size <= 0 ? 10 : Math.min(size, 100);
        Page<SalesTransaction> result = salesRepo.findAllByOrderByTxnDateDescIdDesc(PageRequest.of(p, s));
        List<SalesTxnResponse> items = result.getContent().stream().map(SalesTxnResponse::from).toList();
        return new PagedSalesResponse(items, p, s, result.getTotalElements(), result.getTotalPages());
    }

    public ShipmentResponse dispatch(DispatchShipmentRequest req) {
        if (req == null || req.origin() == null || req.origin().isBlank()
                || req.destination() == null || req.destination().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Origin and destination are required");
        }
        Shipment s = Shipment.builder()
                .code(nz(req.code()).isBlank() ? autoCode() : req.code().trim())
                .vehicle(emptyToNull(req.vehicle()))
                .origin(req.origin().trim())
                .destination(req.destination().trim())
                .weightKg(req.weightKg() == null ? BigDecimal.ZERO : req.weightKg())
                .status(parseStatus(req.status()))
                .onTime(true)
                .etaText(emptyToNull(req.etaText()))
                .speedKmh(req.speedKmh())
                .trackToken(newToken())
                .build();
        return ShipmentResponse.from(shipmentRepo.save(s));
    }

    // Manually set a shipment's status. Admins get full control (including moving
    // it back a step to correct a mistake); we only validate it is a real state.
    public ShipmentResponse updateStatus(Long id, UpdateStatusRequest req) {
        String value = req == null ? null : req.status();
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status is required");
        }
        Shipment s = shipmentRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shipment not found"));
        s.setStatus(parseStatusStrict(value));
        return ShipmentResponse.from(shipmentRepo.save(s));
    }

    // Edit an existing shipment's route / haulage details. Status + live GPS are
    // left untouched here (status has its own endpoint).
    public ShipmentResponse updateShipment(Long id, UpdateShipmentRequest req) {
        if (req == null || req.origin() == null || req.origin().isBlank()
                || req.destination() == null || req.destination().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Origin and destination are required");
        }
        Shipment s = shipmentRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Shipment not found"));
        if (req.code() != null && !req.code().isBlank()) {
            s.setCode(req.code().trim());
        }
        s.setVehicle(emptyToNull(req.vehicle()));
        s.setOrigin(req.origin().trim());
        s.setDestination(req.destination().trim());
        s.setWeightKg(req.weightKg() == null ? BigDecimal.ZERO : req.weightKg());
        s.setEtaText(emptyToNull(req.etaText()));
        if (req.speedKmh() != null) {
            s.setSpeedKmh(req.speedKmh());
        }
        return ShipmentResponse.from(shipmentRepo.save(s));
    }

    // Permanently delete a shipment (e.g. clearing old delivered rows to keep the
    // shipments table + database lean).
    public void deleteShipment(Long id) {
        if (!shipmentRepo.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Shipment not found");
        }
        shipmentRepo.deleteById(id);
    }

    // ---- live map + public driver tracking ----

    // The single estate-warehouse row. Seeded by V11 from the app.warehouse.*
    // defaults; created on demand from those same defaults if the row is somehow
    // missing (defensive, e.g. a partially-migrated DB).
    private Warehouse warehouseEntity() {
        return warehouseRepo.findById(WAREHOUSE_ID).orElseGet(() -> {
            Warehouse w = new Warehouse();
            w.setId(WAREHOUSE_ID);
            w.setName(warehouseName);
            w.setLat(warehouseLat);
            w.setLng(warehouseLng);
            return warehouseRepo.save(w);
        });
    }

    public WarehouseResponse warehouse() {
        Warehouse w = warehouseEntity();
        return new WarehouseResponse(w.getName(), w.getLat(), w.getLng());
    }

    // Relocate the estate warehouse (admin only). The live map + every /track page
    // pick up the new position immediately.
    public WarehouseResponse updateWarehouse(WarehouseUpdateRequest req) {
        if (req == null || req.name() == null || req.name().isBlank()
                || req.lat() == null || req.lng() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name, lat and lng are required");
        }
        if (req.lat().compareTo(new BigDecimal("-90")) < 0 || req.lat().compareTo(new BigDecimal("90")) > 0
                || req.lng().compareTo(new BigDecimal("-180")) < 0 || req.lng().compareTo(new BigDecimal("180")) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Latitude must be between -90 and 90, longitude between -180 and 180");
        }
        Warehouse w = warehouseEntity();
        w.setName(req.name().trim());
        w.setLat(req.lat());
        w.setLng(req.lng());
        Warehouse saved = warehouseRepo.save(w);
        return new WarehouseResponse(saved.getName(), saved.getLat(), saved.getLng());
    }

    // Public read for the /track/{token} page. 404s on an unknown token.
    public TrackResponse track(String token) {
        return toTrack(findByToken(token));
    }

    // Public write: record a GPS fix from the driver's browser. The first fix on
    // a LOADING shipment flips it to IN_TRANSIT so the tracker advances on its
    // own once the driver starts moving.
    public TrackResponse recordLocation(String token, LocationPingRequest req) {
        if (req == null || req.lat() == null || req.lng() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "lat and lng are required");
        }
        Shipment s = findByToken(token);
        s.setCurrentLat(req.lat());
        s.setCurrentLng(req.lng());
        if (req.speedKmh() != null) {
            s.setSpeedKmh(req.speedKmh());
        }
        s.setHeadingDeg(req.headingDeg());
        s.setLastPingAt(OffsetDateTime.now());
        if (s.getStatus() == ShipmentStatus.LOADING) {
            s.setStatus(ShipmentStatus.IN_TRANSIT);
        }
        return toTrack(shipmentRepo.save(s));
    }

    private Shipment findByToken(String token) {
        return shipmentRepo.findByTrackToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown tracking link"));
    }

    private TrackResponse toTrack(Shipment s) {
        Warehouse w = warehouseEntity();
        return TrackResponse.from(s, w.getName(), w.getLat(), w.getLng());
    }

    private static String newToken() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    // ---- helpers ----
    private static ShipmentStatus parseStatusStrict(String v) {
        try {
            return ShipmentStatus.valueOf(v.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid shipment status: " + v);
        }
    }

    private static ShipmentStatus parseStatus(String v) {
        if (v == null || v.isBlank()) return ShipmentStatus.LOADING;
        try {
            return ShipmentStatus.valueOf(v.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid shipment status: " + v);
        }
    }

    private static String autoCode() {
        return "SH-" + (System.currentTimeMillis() % 100000);
    }

    private static String nz(String v) {
        return v == null ? "" : v;
    }

    private static String emptyToNull(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }
}
