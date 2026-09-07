package com.chaghor.chaghor.inventory;

import com.chaghor.chaghor.inventory.dto.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

// Business logic for the Inventory / Requisition module: the six KPI cards, the
// paginated + filterable item table, the site-distribution donut, and the
// approve / hold / reject flow for supervisor requisitions. Stock level % and
// the IN_STOCK / LOW_STOCK status are derived here (never stored).
@Service
public class InventoryService {

    // Percentage thresholds. < CRITICAL_PCT = stock-out imminent (critical);
    // < LOW_PCT = running low; otherwise healthy.
    private static final int CRITICAL_PCT = 15;
    private static final int LOW_PCT = 40;

    private final InventoryRepository itemRepo;
    private final RequisitionRepository reqRepo;

    public InventoryService(InventoryRepository itemRepo, RequisitionRepository reqRepo) {
        this.itemRepo = itemRepo;
        this.reqRepo = reqRepo;
    }

    @Transactional(readOnly = true)
    public InventorySummaryResponse summary() {
        List<InventoryItem> all = itemRepo.findAll();
        BigDecimal totalUnits = BigDecimal.ZERO;
        BigDecimal stockValue = BigDecimal.ZERO;
        int low = 0, critical = 0;
        for (InventoryItem it : all) {
            totalUnits = totalUnits.add(nz(it.getQuantity()));
            stockValue = stockValue.add(nz(it.getQuantity()).multiply(nz(it.getUnitValue())));
            int pct = pct(it);
            if (pct < CRITICAL_PCT) {
                critical++;
            } else if (pct < LOW_PCT) {
                low++;
            }
        }
        long itemsDelta = itemRepo.countByCreatedAtAfter(OffsetDateTime.now().minusDays(30));
        long pending = reqRepo.countByStatus(RequisitionStatus.PENDING);
        OffsetDateTime startOfToday = LocalDate.now()
                .atStartOfDay(ZoneId.systemDefault()).toOffsetDateTime();
        long approvedToday = reqRepo.countByStatusAndDecidedAtAfter(RequisitionStatus.APPROVED, startOfToday);

        return new InventorySummaryResponse(
                totalUnits.setScale(0, RoundingMode.HALF_UP).longValue(),
                itemsDelta,
                stockValue.setScale(0, RoundingMode.HALF_UP),
                low, critical, pending, approvedToday);
    }

    @Transactional(readOnly = true)
    public ItemPageResponse items(int page, int size, String category, String q) {
        int p = Math.max(page, 0);
        int s = size <= 0 ? 8 : Math.min(size, 200);
        Page<InventoryItem> result = itemRepo.search(blank(category), blank(q), PageRequest.of(p, s));
        List<ItemResponse> items = result.getContent().stream().map(this::toItem).toList();
        return new ItemPageResponse(items, p, s, result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public DistributionResponse distribution() {
        List<InventoryRepository.SiteAgg> rows = itemRepo.distribution();
        long total = rows.stream().mapToLong(InventoryRepository.SiteAgg::getCount).sum();
        List<DistributionSlice> slices = new ArrayList<>();
        for (InventoryRepository.SiteAgg r : rows) {
            int percent = total == 0 ? 0 : (int) Math.round(r.getCount() * 100.0 / total);
            slices.add(new DistributionSlice(r.getLabel(), r.getCount(), percent));
        }
        return new DistributionResponse(slices.size(), slices);
    }

    @Transactional(readOnly = true)
    public List<RequisitionResponse> requisitions(String status) {
        RequisitionStatus st = (status == null || status.isBlank())
                ? RequisitionStatus.PENDING
                : parseReqStatus(status);
        return reqRepo.findByStatusOrderByRequestedAtDesc(st).stream().map(this::toReq).toList();
    }

    @Transactional
    public RequisitionResponse decide(Long id, String action, Long userId) {
        Requisition r = reqRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Requisition not found"));
        RequisitionStatus target = switch (action == null ? "" : action.toLowerCase()) {
            case "approve" -> RequisitionStatus.APPROVED;
            case "hold" -> RequisitionStatus.HELD;
            case "reject" -> RequisitionStatus.REJECTED;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown action: " + action);
        };
        r.setStatus(target);
        r.setDecidedAt(OffsetDateTime.now());
        r.setDecidedBy(userId);
        reqRepo.save(r);
        return toReq(r);
    }

    @Transactional
    public ItemResponse createItem(NewItemRequest req) {
        if (req.name() == null || req.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        InventoryCategory cat = parseCategory(req.category());
        BigDecimal capacity = nz(req.capacity());
        if (capacity.signum() <= 0) {
            capacity = BigDecimal.valueOf(100);
        }
        InventoryItem it = InventoryItem.builder()
                .name(req.name().trim())
                .category(cat)
                .codeLabel(blankToNull(req.codeLabel()))
                .codeValue(blankToNull(req.codeValue()))
                .quantity(nz(req.quantity()))
                .capacity(capacity)
                .unit(req.unit() == null || req.unit().isBlank() ? "units" : req.unit().trim())
                .unitValue(nz(req.unitValue()))
                .reorderLevel(nz(req.reorderLevel()))
                .site(req.site() == null || req.site().isBlank() ? "Central Hub" : req.site().trim())
                .build();
        return toItem(itemRepo.save(it));
    }

    // ---- helpers ----
    private ItemResponse toItem(InventoryItem it) {
        int pct = pct(it);
        String status = pct < LOW_PCT ? "LOW_STOCK" : "IN_STOCK";
        return new ItemResponse(
                it.getId(), it.getName(), it.getCodeLabel(), it.getCodeValue(),
                it.getCategory().name(), it.getUnit(), nz(it.getQuantity()), nz(it.getCapacity()),
                pct, status, it.getSite());
    }

    private RequisitionResponse toReq(Requisition r) {
        return new RequisitionResponse(
                r.getId(), r.getItemLabel(), r.getRequester(), r.getDetail(),
                r.getStatus().name(), r.getRequestedAt(), r.getDecidedAt());
    }

    private int pct(InventoryItem it) {
        BigDecimal cap = nz(it.getCapacity());
        if (cap.signum() <= 0) {
            return 0;
        }
        return nz(it.getQuantity())
                .multiply(BigDecimal.valueOf(100))
                .divide(cap, 0, RoundingMode.HALF_UP)
                .intValue();
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String blank(String v) {
        return v == null ? "" : v.trim();
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static InventoryCategory parseCategory(String v) {
        try {
            return InventoryCategory.valueOf(v.trim().toUpperCase());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid category");
        }
    }

    private static RequisitionStatus parseReqStatus(String v) {
        try {
            return RequisitionStatus.valueOf(v.trim().toUpperCase());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status");
        }
    }
}
