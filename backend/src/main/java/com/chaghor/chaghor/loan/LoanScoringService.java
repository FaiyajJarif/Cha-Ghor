package com.chaghor.chaghor.loan;

import com.chaghor.chaghor.attendance.AttendanceRepository;
import com.chaghor.chaghor.attendance.AttendanceStatus;
import com.chaghor.chaghor.chatbot.ChatbotService;
import com.chaghor.chaghor.loan.dto.LoanScoreResponse;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// AI loan scoring.
//
// The split of responsibility is the whole point:
//   * THIS CLASS computes the facts -- prior loans and how each ended, how much
//     was repaid, attendance rate, requested amount as a multiple of daily
//     wage, months employed. Deterministic, reproducible, straight from the
//     estate's own records.
//   * THE MODEL judges those facts and explains the judgement, in English and
//     Bangla.
//
// So every number an admin reads was computed here, not written by the model. A
// model can be wrong about whether a request is risky; it must never be wrong
// about how much the worker already repaid.
//
// The assessment is persisted (loan_ai_assessment, one row per loan) purely as
// an audit record of what was advised at decision time. Nothing learns from it.
// Scoring accuracy comes from real repayment outcomes, which are re-read on
// every run.
//
// Nothing here approves or rejects anything. LoanService.decide() remains the
// only path that changes a loan's status, and only an admin can call it.
@Service
public class LoanScoringService {

    private static final List<LoanStatus> CLOSED_GOOD = List.of(LoanStatus.REPAID);
    private static final List<LoanStatus> OUTSTANDING =
            List.of(LoanStatus.ACTIVE, LoanStatus.OVERDUE);
    private static final int ATTENDANCE_WINDOW_DAYS = 90;

    private final LoanRepository loanRepository;
    private final LoanAiAssessmentRepository assessmentRepository;
    private final WorkerRepository workerRepository;
    private final AttendanceRepository attendanceRepository;
    private final ChatbotService chatbotService;
    private final ObjectMapper mapper = new ObjectMapper();

    // Explicit constructor, no Lombok -- matches LoanService in this module.
    public LoanScoringService(LoanRepository loanRepository,
                              LoanAiAssessmentRepository assessmentRepository,
                              WorkerRepository workerRepository,
                              AttendanceRepository attendanceRepository,
                              ChatbotService chatbotService) {
        this.loanRepository = loanRepository;
        this.assessmentRepository = assessmentRepository;
        this.workerRepository = workerRepository;
        this.attendanceRepository = attendanceRepository;
        this.chatbotService = chatbotService;
    }

    // Return a stored assessment without calling the model, so the pending
    // queue can show what was already scored.
    @Transactional(readOnly = true)
    public LoanScoreResponse existing(Long loanId) {
        Loan loan = require(loanId);
        return assessmentRepository.findByLoanId(loanId)
                .map(a -> toResponse(loan, a, buildFacts(loan)))
                .orElseGet(() -> LoanScoreResponse.unavailable(loanId,
                        "This request has not been scored yet."));
    }

    @Transactional
    public LoanScoreResponse score(Long loanId) {
        Loan loan = require(loanId);
        Map<String, Object> facts = buildFacts(loan);

        Map<String, Object> res;
        try {
            res = chatbotService.scoreLoan(facts, nz(loan.getPrincipal()));
        } catch (ResponseStatusException ex) {
            // The AI being down must not block lending. The admin still has the
            // facts and the buttons.
            return new LoanScoreResponse(loanId, false,
                    "The AI scorer is not available right now. The figures below are still accurate.",
                    null, null, null, null, null, null, null, facts);
        }

        RiskLevel risk = riskOf(str(res.get("risk")));
        String recommendation = recommendationOf(str(res.get("recommendation")));
        BigDecimal suggested = suggestedOf(res.get("suggested_amount"), nz(loan.getPrincipal()));

        LoanAiAssessment a = assessmentRepository.findByLoanId(loanId)
                .orElseGet(() -> LoanAiAssessment.builder().loanId(loanId).build());
        a.setRiskLevel(risk);
        a.setSuggestedAmount(suggested);
        a.setReasonEn(trimTo(str(res.get("reason_en")), 600));
        a.setReasonBn(trimTo(str(res.get("reason_bn")), 600));
        a.setModel(trimTo(str(res.get("provider")), 80));
        a.setFeaturesJson(toJson(withRecommendation(facts, recommendation)));
        assessmentRepository.save(a);

        return new LoanScoreResponse(
                loanId, true, null, risk.name(), recommendation, suggested,
                a.getReasonEn(), a.getReasonBn(), a.getModel(),
                a.getCreatedAt() == null ? null : a.getCreatedAt().toString(),
                facts);
    }

    // ---- the facts -----------------------------------------------------------

    // Everything the judgement is allowed to rest on. Computed here so the
    // numbers are reproducible and the model cannot misstate them.
    private Map<String, Object> buildFacts(Loan loan) {
        Map<String, Object> f = new LinkedHashMap<>();
        BigDecimal requested = nz(loan.getPrincipal());
        f.put("requested_amount", requested);
        f.put("worker_name", loan.getWorkerName());
        f.put("stated_reason", loan.getReason());

        Long workerId = loan.getWorkerId();
        Worker worker = workerId == null ? null : workerRepository.findById(workerId).orElse(null);

        // A request not linked to a worker cannot be assessed on history at all,
        // and cannot be auto-deducted from wages either. Say so explicitly
        // rather than letting it look like a clean record.
        f.put("linked_to_worker", worker != null);

        BigDecimal dailyWage = worker != null ? nz(worker.getDailyWage()) : BigDecimal.ZERO;
        f.put("daily_wage", dailyWage);
        f.put("requested_to_daily_wage", dailyWage.signum() > 0
                ? requested.divide(dailyWage, 1, RoundingMode.HALF_UP)
                : null);

        f.put("months_employed", worker != null && worker.getJoinDate() != null
                ? ChronoUnit.MONTHS.between(worker.getJoinDate(), LocalDate.now())
                : null);
        f.put("worker_status", worker != null ? worker.getStatus() : null);

        // Borrowing history for this worker, excluding the request being scored.
        List<Loan> history = new ArrayList<>();
        if (workerId != null) {
            for (Loan l : loanRepository.findAll()) {
                if (workerId.equals(l.getWorkerId()) && !l.getId().equals(loan.getId())) {
                    history.add(l);
                }
            }
        }
        int repaidInFull = 0, everOverdue = 0, stillOutstanding = 0;
        BigDecimal borrowed = BigDecimal.ZERO, repaid = BigDecimal.ZERO;
        for (Loan l : history) {
            borrowed = borrowed.add(nz(l.getPrincipal()));
            repaid = repaid.add(nz(l.getRepaid()));
            if (CLOSED_GOOD.contains(l.getStatus())) repaidInFull++;
            if (l.getStatus() == LoanStatus.OVERDUE) everOverdue++;
            if (OUTSTANDING.contains(l.getStatus())) stillOutstanding++;
        }
        f.put("prior_loans", history.size());
        f.put("prior_repaid_in_full", repaidInFull);
        f.put("prior_ever_overdue", everOverdue);
        f.put("prior_still_outstanding", stillOutstanding);
        f.put("total_borrowed_before", borrowed);
        f.put("total_repaid_before", repaid);
        f.put("outstanding_now", borrowed.subtract(repaid).max(BigDecimal.ZERO));

        // Attendance over the last 90 days. Absent data is reported as absent
        // data, not as zero attendance -- an empty register is not a bad worker.
        if (workerId != null) {
            LocalDate to = LocalDate.now();
            LocalDate from = to.minusDays(ATTENDANCE_WINDOW_DAYS);
            long present = attendanceRepository.countByWorkerIdAndWorkDateBetweenAndStatus(
                    workerId, from, to, AttendanceStatus.present);
            long absent = attendanceRepository.countByWorkerIdAndWorkDateBetweenAndStatus(
                    workerId, from, to, AttendanceStatus.absent);
            long leave = attendanceRepository.countByWorkerIdAndWorkDateBetweenAndStatus(
                    workerId, from, to, AttendanceStatus.leave);
            long marked = present + absent + leave;
            f.put("attendance_days_marked", marked);
            f.put("attendance_rate_pct", marked > 0
                    ? BigDecimal.valueOf(present * 100.0 / marked).setScale(1, RoundingMode.HALF_UP)
                    : null);
        } else {
            f.put("attendance_days_marked", 0);
            f.put("attendance_rate_pct", null);
        }
        f.put("attendance_window_days", ATTENDANCE_WINDOW_DAYS);

        // Named so the model does not read a missing signal as a bad one.
        f.put("note_missing_data",
                "A null attendance_rate_pct means no attendance has been recorded, not poor attendance. "
                + "Leaf productivity is not available in this system yet.");
        return f;
    }

    // ---- helpers -------------------------------------------------------------

    private Map<String, Object> withRecommendation(Map<String, Object> facts, String reco) {
        Map<String, Object> m = new LinkedHashMap<>(facts);
        m.put("_recommendation", reco);
        return m;
    }

    private LoanScoreResponse toResponse(Loan loan, LoanAiAssessment a, Map<String, Object> facts) {
        String reco = "review";
        try {
            if (a.getFeaturesJson() != null) {
                Map<?, ?> stored = mapper.readValue(a.getFeaturesJson(), Map.class);
                Object r = stored.get("_recommendation");
                if (r != null) reco = recommendationOf(r.toString());
            }
        } catch (Exception ignored) {
            // A stored blob we cannot parse is not worth failing the request for.
        }
        return new LoanScoreResponse(
                loan.getId(), true, null,
                a.getRiskLevel() == null ? null : a.getRiskLevel().name(),
                reco, a.getSuggestedAmount(), a.getReasonEn(), a.getReasonBn(),
                a.getModel(),
                a.getCreatedAt() == null ? null : a.getCreatedAt().toString(),
                facts);
    }

    private Loan require(Long id) {
        return loanRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan request not found"));
    }

    // Defaults to the middle band: an unusable answer must never read as "low risk".
    private static RiskLevel riskOf(String v) {
        String s = v == null ? "" : v.trim().toLowerCase();
        if ("medium".equals(s) || "moderate".equals(s)) {
            s = "med";
        }
        try {
            return RiskLevel.valueOf(s);
        } catch (IllegalArgumentException ex) {
            return RiskLevel.med;
        }
    }

    // Defaults to "review": if we cannot read the model, a human looks at it.
    private static String recommendationOf(String v) {
        String s = v == null ? "" : v.trim().toLowerCase();
        return switch (s) {
            case "approve", "decline", "review" -> s;
            default -> "review";
        };
    }

    // A suggested amount is only meaningful if it is positive and actually
    // smaller than what was asked for.
    private static BigDecimal suggestedOf(Object raw, BigDecimal requested) {
        if (raw == null) {
            return null;
        }
        BigDecimal v;
        try {
            v = raw instanceof Number n
                    ? BigDecimal.valueOf(n.doubleValue())
                    : new BigDecimal(raw.toString().trim());
        } catch (NumberFormatException ex) {
            return null;
        }
        if (v.signum() <= 0 || v.compareTo(requested) >= 0) {
            return null;
        }
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    private String toJson(Map<String, Object> m) {
        try {
            return mapper.writeValueAsString(m);
        } catch (Exception ex) {
            return null;
        }
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static String trimTo(String s, int max) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static BigDecimal nz(BigDecimal b) {
        return b == null ? BigDecimal.ZERO : b;
    }
}
