package com.chaghor.chaghor.report;

import com.chaghor.chaghor.chatbot.ChatbotService;
import com.chaghor.chaghor.report.dto.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

// Business logic for the Reports module: the estate-wide KPI rollup for a
// period, the monthly trend series, and generating / finalizing / deleting
// saved report snapshots. generate() now asks the AI service to write the
// narrative from the period KPIs; if the AI service is unavailable it falls
// back to the deterministic templated narrative so a report always saves.
@Service
public class ReportService {

    private final ReportRepository repo;
    private final ChatbotService chatbot;

    public ReportService(ReportRepository repo, ChatbotService chatbot) {
        this.repo = repo;
        this.chatbot = chatbot;
    }

    public ReportSummaryResponse summary(LocalDate start, LocalDate end) {
        LocalDate[] p = resolve(start, end);
        return buildSummary(p[0], p[1]);
    }

    private ReportSummaryResponse buildSummary(LocalDate s, LocalDate e) {
        var fin = repo.financeSummary(s, e);
        BigDecimal revenue = nz(fin == null ? null : fin.getRevenue());
        BigDecimal expense = nz(fin == null ? null : fin.getExpense());
        BigDecimal payroll = nz(fin == null ? null : fin.getPayroll());
        BigDecimal profit = revenue.subtract(expense);
        double margin = revenue.signum() > 0
                ? profit.divide(revenue, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                        .setScale(1, RoundingMode.HALF_UP).doubleValue()
                : 0.0;
        double attendance = nz(repo.attendanceRate(s, e)).doubleValue();
        long workers = repo.activeWorkers();
        var loan = repo.loanTotals();
        BigDecimal outstanding = nz(loan == null ? null : loan.getOutstanding());
        BigDecimal recovered = nz(loan == null ? null : loan.getRecovered());
        return new ReportSummaryResponse(revenue, expense, profit, payroll, margin,
                attendance, workers, outstanding, recovered, s.toString(), e.toString());
    }

    public List<MonthlyPoint> trend(int months) {
        int n = months <= 0 ? 6 : months;
        List<ReportRepository.MonthlyAgg> all = repo.monthly();
        List<ReportRepository.MonthlyAgg> tail =
                all.size() > n ? all.subList(all.size() - n, all.size()) : all;
        List<MonthlyPoint> out = new ArrayList<>();
        for (var m : tail) {
            BigDecimal rev = nz(m.getRevenue());
            BigDecimal exp = nz(m.getExpense());
            out.add(new MonthlyPoint(monthLabel(m.getYm()), rev, exp, rev.subtract(exp)));
        }
        return out;
    }

    public List<SavedReportResponse> saved() {
        return repo.findAllByOrderByGeneratedAtDesc().stream()
                .map(SavedReportResponse::from).toList();
    }

    public SavedReportResponse generate(GenerateReportRequest req, Long userId) {
        LocalDate[] p = resolve(req == null ? null : req.periodStart(),
                                req == null ? null : req.periodEnd());
        LocalDate s = p[0], e = p[1];
        String language = req == null ? null : req.language();
        ReportSummaryResponse sum = buildSummary(s, e);
        String title = (req != null && req.title() != null && !req.title().isBlank())
                ? req.title().trim()
                : "Monthly Report - " + periodLabel(s);
        SavedReport r = SavedReport.builder()
                .title(title)
                .reportType("MONTHLY")
                .periodStart(s)
                .periodEnd(e)
                .status(ReportStatus.DRAFT)
                .summary(aiNarrative(sum, s, e, language))
                .revenue(sum.revenue())
                .expense(sum.expense())
                .netProfit(sum.netProfit())
                .generatedBy(userId)
                .build();
        return SavedReportResponse.from(repo.save(r));
    }

    public SavedReportResponse finalizeReport(Long id) {
        SavedReport r = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found"));
        if (r.getStatus() == ReportStatus.FINALIZED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Report is already finalized");
        }
        r.setStatus(ReportStatus.FINALIZED);
        r.setFinalizedAt(OffsetDateTime.now());
        return SavedReportResponse.from(repo.save(r));
    }

    public void delete(Long id) {
        if (!repo.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Report not found");
        }
        repo.deleteById(id);
    }

    // ---- helpers ----
    private static LocalDate[] resolve(LocalDate start, LocalDate end) {
        LocalDate s = start != null ? start : LocalDate.now().withDayOfMonth(1);
        LocalDate e = end != null ? end : YearMonth.from(s).atEndOfMonth();
        if (e.isBefore(s)) {
            e = YearMonth.from(s).atEndOfMonth();
        }
        return new LocalDate[]{s, e};
    }

    // Ask the AI service for a narrative; fall back to the template on any error
    // (AI service down, timeout, empty response) so a report always generates.
    private String aiNarrative(ReportSummaryResponse sum, LocalDate s, LocalDate e, String language) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("period", periodLabel(s));
        m.put("periodStart", s.toString());
        m.put("periodEnd", e.toString());
        m.put("currency", "BDT");
        m.put("revenue", sum.revenue());
        m.put("expense", sum.expense());
        m.put("netProfit", sum.netProfit());
        m.put("profitMargin", sum.profitMargin());
        m.put("payrollCost", sum.payrollCost());
        m.put("attendanceRate", sum.attendanceRate());
        m.put("activeWorkers", sum.activeWorkers());
        m.put("loanOutstanding", sum.loanOutstanding());
        m.put("loanRecovered", sum.loanRecovered());
        try {
            String text = chatbot.reportNarrative(m, language, periodLabel(s));
            if (text != null && !text.isBlank()) {
                return text.trim();
            }
        } catch (Exception ex) {
            // AI unavailable -> deterministic templated narrative below
        }
        return narrative(sum, s);
    }

    private static String narrative(ReportSummaryResponse s, LocalDate start) {
        return String.format(Locale.ENGLISH,
                "For %s, the estate recorded revenue of BDT %s against expenses of BDT %s, "
              + "for a net profit of BDT %s (margin %.1f%%). Payroll cost was BDT %s. "
              + "Attendance averaged %.1f%% across %d active workers. "
              + "Loans outstanding stand at BDT %s with BDT %s recovered to date.",
                periodLabel(start),
                money(s.revenue()), money(s.expense()), money(s.netProfit()), s.profitMargin(),
                money(s.payrollCost()), s.attendanceRate(), s.activeWorkers(),
                money(s.loanOutstanding()), money(s.loanRecovered()));
    }

    private static String money(BigDecimal v) {
        return nz(v).setScale(0, RoundingMode.HALF_UP).toString();
    }

    private static String periodLabel(LocalDate d) {
        return d.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH) + " " + d.getYear();
    }

    private static String monthLabel(String ym) {
        try {
            return YearMonth.parse(ym).getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
        } catch (Exception ex) {
            return ym;
        }
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
