package com.chaghor.chaghor.anomaly;

import com.chaghor.chaghor.anomaly.dto.AnomalyFlagResponse;
import com.chaghor.chaghor.anomaly.dto.AnomalyScanResponse;
import com.chaghor.chaghor.chatbot.ChatbotService;
import com.chaghor.chaghor.finance.FinanceEntry;
import com.chaghor.chaghor.finance.FinanceRepository;
import com.chaghor.chaghor.loan.Loan;
import com.chaghor.chaghor.loan.LoanRepository;
import com.chaghor.chaghor.payroll.Payroll;
import com.chaghor.chaghor.payroll.PayrollRepository;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

// AI anomaly flags.
//
// Detection is done by the model in ai_service. This class does the part the
// model cannot be trusted with: proving that every row it named actually
// exists, and attaching the real worker name or loan reference from OUR data
// rather than from the model's output.
//
// Why that matters: the model is asked to review money. If it invents
// "payslip #482" and we render it, an admin goes looking for a payslip that was
// never there. Every flag whose ref does not resolve is dropped and counted.
//
// The scan is stateless -- nothing is written, nothing is remembered. A flag
// disappears as soon as the underlying row is fixed.
@Service
@RequiredArgsConstructor
public class AnomalyService {

    private static final Set<String> SCOPES = Set.of("payroll", "loan", "finance");
    private static final int REVIEW_LIMIT = 100;

    private final ChatbotService chatbotService;
    private final PayrollRepository payrollRepository;
    private final LoanRepository loanRepository;
    private final WorkerRepository workerRepository;
    private final FinanceRepository financeRepository;

    @Transactional(readOnly = true)
    public AnomalyScanResponse scan(String scope) {
        String s = scope == null ? "" : scope.trim().toLowerCase();
        if (!SCOPES.contains(s)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Scope must be one of: payroll, loan, finance.");
        }

        Map<String, Object> res;
        try {
            res = chatbotService.detectAnomalies(s, REVIEW_LIMIT);
        } catch (ResponseStatusException ex) {
            // The AI service being down must not break the page it sits on.
            return AnomalyScanResponse.unavailable(s,
                    "The AI reviewer is not available right now, so these records have not been checked.");
        }

        // Real ids and labels, straight from our database.
        Map<Long, String> labels = switch (s) {
            case "payroll" -> payrollLabels();
            case "loan" -> loanLabels();
            default -> financeLabels();
        };

        List<AnomalyFlagResponse> flags = new ArrayList<>();
        int discarded = intOf(res.get("dropped"));

        Object rawFlags = res.get("flags");
        if (rawFlags instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) {
                    discarded++;
                    continue;
                }
                Long ref = longOf(m.get("ref"));
                // Second line of defence: the model may only cite rows that
                // exist right now. ai_service already checked its own result
                // set; this checks the database.
                if (ref == null || !labels.containsKey(ref)) {
                    discarded++;
                    continue;
                }
                String reason = trimTo(str(m.get("reason")), 400);
                String title = trimTo(str(m.get("title")), 80);
                if (isBlank(reason) && isBlank(title)) {
                    discarded++;
                    continue;
                }
                flags.add(new AnomalyFlagResponse(
                        ref,
                        labels.get(ref),
                        severity(str(m.get("severity"))),
                        isBlank(title) ? "Needs review" : title,
                        reason));
            }
        }

        return new AnomalyScanResponse(
                s, true, null, intOf(res.get("row_count")), discarded,
                str(res.get("provider")), flags);
    }

    // ---- labels come from our data, never from the model --------------------

    private Map<Long, String> payrollLabels() {
        Map<Long, Worker> workers = new HashMap<>();
        workerRepository.findAll().forEach(w -> workers.put(w.getId(), w));
        Map<Long, String> out = new HashMap<>();
        for (Payroll p : payrollRepository.findAll()) {
            Worker w = workers.get(p.getWorkerId());
            out.put(p.getId(), (w != null ? w.getFullName() : "Worker #" + p.getWorkerId())
                    + " · " + p.getPeriodStart() + " to " + p.getPeriodEnd());
        }
        return out;
    }

    private Map<Long, String> loanLabels() {
        Map<Long, String> out = new HashMap<>();
        for (Loan l : loanRepository.findAll()) {
            String ref = isBlank(l.getReference()) ? "No reference" : l.getReference();
            out.put(l.getId(), ref + " · " + l.getWorkerName());
        }
        return out;
    }

    private Map<Long, String> financeLabels() {
        Map<Long, String> out = new HashMap<>();
        for (FinanceEntry e : financeRepository.findAll()) {
            String ref = isBlank(e.getRefId()) ? "" : e.getRefId() + " · ";
            out.put(e.getId(), ref + e.getAccount() + " · " + e.getEntryDate());
        }
        return out;
    }

    // ---- helpers ------------------------------------------------------------

    private static String severity(String v) {
        String s = v == null ? "" : v.trim().toLowerCase();
        return switch (s) {
            case "high", "medium", "low" -> s;
            default -> "medium";
        };
    }

    private static Long longOf(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return o == null ? null : Long.valueOf(o.toString().trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static int intOf(Object o) {
        return o instanceof Number n ? n.intValue() : 0;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static String trimTo(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
