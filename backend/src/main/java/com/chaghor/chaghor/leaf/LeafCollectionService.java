package com.chaghor.chaghor.leaf;

import com.chaghor.chaghor.leaf.dto.LeafRecordRequest;
import com.chaghor.chaghor.leaf.dto.LeafResponse;
import com.chaghor.chaghor.leaf.dto.LeafSummaryResponse;
import com.chaghor.chaghor.user.UserRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.chaghor.chaghor.zone.Zone;
import com.chaghor.chaghor.zone.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

// Green-leaf collection module. Records how much leaf each worker brought in
// per day and lists it back for the day sheet + a small summary card. Quality
// grading is demo-tier AI, so grade is optional and set manually when provided.
@Service
@RequiredArgsConstructor
public class LeafCollectionService {

    private final LeafCollectionRepository repo;
    private final WorkerRepository workerRepository;
    private final ZoneRepository zoneRepository;
    private final UserRepository userRepository;

    @Transactional
    public LeafResponse record(LeafRecordRequest req, String recordedByUsername) {
        if (req == null || req.workerId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "workerId is required");
        }
        Worker worker = workerRepository.findById(req.workerId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Worker not found"));

        BigDecimal weight = (req.weightKg() == null) ? BigDecimal.ZERO : req.weightKg();
        if (weight.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "weightKg cannot be negative");
        }

        Long recordedBy = (recordedByUsername == null)
                ? null
                : userRepository.findByUsername(recordedByUsername).map(u -> u.getId()).orElse(null);

        LeafCollection lc = LeafCollection.builder()
                .workerId(worker.getId())
                .zoneId(worker.getZoneId())
                .collectDate(req.date() != null ? req.date() : LocalDate.now())
                .weightKg(weight)
                .qualityGrade(parseGrade(req.grade()))
                .recordedBy(recordedBy)
                .build();
        repo.save(lc);
        return toResponse(lc, worker);
    }

    @Transactional(readOnly = true)
    public List<LeafResponse> listByDate(LocalDate date) {
        LocalDate d = (date != null) ? date : LocalDate.now();
        List<LeafResponse> out = new ArrayList<>();
        for (LeafCollection lc : repo.findByCollectDateOrderByIdDesc(d)) {
            out.add(toResponse(lc, null));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public LeafSummaryResponse summary(LocalDate date) {
        LocalDate d = (date != null) ? date : LocalDate.now();
        List<LeafCollection> rows = repo.findByCollectDateOrderByIdDesc(d);
        BigDecimal total = BigDecimal.ZERO;
        for (LeafCollection lc : rows) {
            total = total.add(lc.getWeightKg() == null ? BigDecimal.ZERO : lc.getWeightKg());
        }
        return new LeafSummaryResponse(d, rows.size(), total);
    }

    // ---- helpers ----
    private LeafResponse toResponse(LeafCollection lc, Worker known) {
        Worker w = (known != null) ? known : workerRepository.findById(lc.getWorkerId()).orElse(null);
        String workerName = (w != null) ? w.getFullName() : null;
        String zone = zoneName(lc.getZoneId());
        String grade = (lc.getQualityGrade() != null) ? lc.getQualityGrade().name() : null;
        return new LeafResponse(lc.getId(), lc.getWorkerId(), workerName, zone,
                lc.getCollectDate(), lc.getWeightKg(), grade);
    }

    private String zoneName(Long zoneId) {
        if (zoneId == null) return null;
        return zoneRepository.findById(zoneId).map(Zone::getName).orElse(null);
    }

    private LeafGrade parseGrade(String g) {
        if (g == null || g.isBlank()) return null;
        try {
            return LeafGrade.valueOf(g.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid grade: " + g);
        }
    }
}
