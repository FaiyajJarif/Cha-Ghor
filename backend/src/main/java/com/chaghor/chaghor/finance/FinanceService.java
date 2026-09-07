package com.chaghor.chaghor.finance;

import com.chaghor.chaghor.finance.dto.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

// Business logic for the Finance / Ledger module: the KPI rollup (with
// month-over-month deltas), the trend series, the expense breakdown, the
// paginated ledger, and manual entry creation.
@Service
public class FinanceService {

    private static final int BREAKDOWN_SLICES = 5; // top N accounts, rest -> "Other"

    private final FinanceRepository repo;
    // Read-only: lets the activity feed tell a cash repayment from one that was
    // deducted from wages (payroll_id set). Same rule the cashOnHand rollup uses.
    private final com.chaghor.chaghor.loan.LoanRepaymentEntryRepository repaymentRepository;

    public FinanceService(FinanceRepository repo,
                          com.chaghor.chaghor.loan.LoanRepaymentEntryRepository repaymentRepository) {
        this.repo = repo;
        this.repaymentRepository = repaymentRepository;
    }

    public FinanceSummaryResponse summary() {
        var agg = repo.summary();
        BigDecimal revenue = nz(agg.getTotalRevenue());
        BigDecimal expenses = nz(agg.getTotalExpenses());
        BigDecimal profit = revenue.subtract(expenses);

        double revPct = 0, expPct = 0, profitPct = 0;
        List<FinanceRepository.MonthlyAgg> months = repo.monthly();
        if (months.size() >= 2) {
            var curr = months.get(months.size() - 1);
            var prev = months.get(months.size() - 2);
            BigDecimal cr = nz(curr.getRevenue()), pr = nz(prev.getRevenue());
            BigDecimal ce = nz(curr.getExpense()), pe = nz(prev.getExpense());
            revPct = pct(pr, cr);
            expPct = pct(pe, ce);
            profitPct = pct(pr.subtract(pe), cr.subtract(ce));
        }
        return new FinanceSummaryResponse(revenue, expenses, profit,
                nz(agg.getCashOnHand()), nz(agg.getPayablesDue()), nz(agg.getOverdue()),
                revPct, expPct, profitPct);
    }

    public List<TrendPoint> trend(int months) {
        int n = months <= 0 ? 6 : months;
        List<FinanceRepository.MonthlyAgg> all = repo.monthly();
        List<FinanceRepository.MonthlyAgg> tail =
                all.size() > n ? all.subList(all.size() - n, all.size()) : all;
        List<TrendPoint> out = new ArrayList<>();
        for (var m : tail) {
            BigDecimal rev = nz(m.getRevenue());
            BigDecimal exp = nz(m.getExpense());
            out.add(new TrendPoint(monthLabel(m.getYm()), rev, exp, rev.subtract(exp)));
        }
        return out;
    }

    public List<BreakdownSlice> breakdown() {
        List<FinanceRepository.BreakdownAgg> rows = repo.breakdown();
        BigDecimal total = rows.stream().map(r -> nz(r.getTotal()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        List<BreakdownSlice> out = new ArrayList<>();
        if (total.signum() == 0) return out;

        BigDecimal other = BigDecimal.ZERO;
        for (int i = 0; i < rows.size(); i++) {
            BigDecimal amt = nz(rows.get(i).getTotal());
            if (i < BREAKDOWN_SLICES) {
                out.add(new BreakdownSlice(rows.get(i).getLabel(), amt, percent(amt, total)));
            } else {
                other = other.add(amt);
            }
        }
        if (other.signum() > 0) {
            out.add(new BreakdownSlice("Other", other, percent(other, total)));
        }
        return out;
    }

    public LedgerPageResponse ledger(int page, int size, String category, String status, String q) {
        int p = Math.max(page, 0);
        int s = size <= 0 ? 10 : Math.min(size, 10000);
        Page<FinanceEntry> result = repo.search(
                blank(category), blank(status), blank(q), PageRequest.of(p, s));
        List<LedgerEntryResponse> entries = result.getContent().stream()
                .map(LedgerEntryResponse::from).toList();
        return new LedgerPageResponse(entries, p, s, result.getTotalElements(), result.getTotalPages());
    }

    public LedgerEntryResponse create(EntryRequest req, Long userId) {
        if (req.account() == null || req.account().isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Account is required");
        if (req.amount() == null || req.amount().signum() < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount must be zero or more");

        LedgerCategory cat = parseCategory(req.category());
        LedgerStatus st = parseStatus(req.status());

        FinanceEntry e = FinanceEntry.builder()
                .entryDate(req.entryDate() == null ? LocalDate.now() : req.entryDate())
                .refId(blankToNull(req.refId()))
                .category(cat)
                .account(req.account().trim())
                .amount(req.amount())
                .status(st)
                .dueDate(st == LedgerStatus.PENDING ? req.dueDate() : null)
                .note(blankToNull(req.note()))
                .sourceType("manual")
                .createdBy(userId)
                .build();
        return LedgerEntryResponse.from(repo.save(e));
    }

    // Auto-post a settled PAYROLL ledger line when a payslip is marked paid.
    // Idempotent: a second call for the same payslip is a no-op, so re-runs or
    // retries never double-count wages. sourceType/sourceId make the row
    // traceable back to the originating payslip.
    public void postPayroll(Long payslipId, String account, BigDecimal amount, LocalDate date) {
        if (payslipId != null && repo.existsBySourceTypeAndSourceId("payroll", payslipId)) {
            return;
        }
        FinanceEntry e = FinanceEntry.builder()
                .entryDate(date == null ? LocalDate.now() : date)
                .refId(payslipId == null ? null : "PAY-" + payslipId)
                .category(LedgerCategory.PAYROLL)
                .account(account == null || account.isBlank() ? "Payroll" : account.trim())
                .amount(amount == null ? BigDecimal.ZERO : amount)
                .status(LedgerStatus.SETTLED)
                .note("Auto-posted from payroll payment")
                .sourceType("payroll")
                .sourceId(payslipId)
                .build();
        repo.save(e);
    }

    // Auto-post a settled ledger line when an admin PAYS a worker withdrawal.
    // Real cash leaves the estate at this moment, so it must hit the books.
    // Categorised as PAYROLL because a withdrawal is an advance against wages;
    // the matching advance_recovery on the worker's next payslip keeps the two
    // from double-counting. Idempotent on (withdrawal, id).
    public void postWithdrawal(Long withdrawalId, String account, BigDecimal amount, LocalDate date) {
        if (withdrawalId != null && repo.existsBySourceTypeAndSourceId("withdrawal", withdrawalId)) {
            return;
        }
        FinanceEntry e = FinanceEntry.builder()
                .entryDate(date == null ? LocalDate.now() : date)
                .refId(withdrawalId == null ? null : "WD-" + withdrawalId)
                .category(LedgerCategory.PAYROLL)
                .account(account == null || account.isBlank() ? "Worker withdrawal" : account.trim())
                .amount(nz(amount))
                .status(LedgerStatus.SETTLED)
                .note("Advance withdrawal paid out (bKash)")
                .sourceType("withdrawal")
                .sourceId(withdrawalId)
                .build();
        repo.save(e);
    }

    // Capital OUT: an approved loan is disbursed to the worker. Category LOAN is
    // deliberately excluded from totalRevenue / totalExpenses (a loan is an asset,
    // not an expense) but it does reduce cash on hand. Idempotent on (loan_out, id).
    public void postLoanDisbursement(Long loanId, String reference, String account,
                                     BigDecimal amount, LocalDate date) {
        if (loanId != null && repo.existsBySourceTypeAndSourceId("loan_out", loanId)) {
            return;
        }
        FinanceEntry e = FinanceEntry.builder()
                .entryDate(date == null ? LocalDate.now() : date)
                .refId(reference == null || reference.isBlank() ? (loanId == null ? null : "L-" + loanId) : reference)
                .category(LedgerCategory.LOAN)
                .account(account == null || account.isBlank() ? "Loan disbursed" : account.trim())
                .amount(nz(amount))
                .status(LedgerStatus.SETTLED)
                .note("Loan disbursed to worker")
                .sourceType("loan_out")
                .sourceId(loanId)
                .build();
        repo.save(e);
    }

    // Capital IN: the worker repays part or all of a loan. finance_ledger carries
    // a CHECK (amount >= 0) from V14, so we cannot store this as a negative
    // number -- direction is carried by source_type = 'loan_in', which the
    // cash-on-hand rollup treats as an inflow. sourceId is the REPAYMENT id (not
    // the loan id) so a loan repaid in instalments posts one line per instalment.
    public void postLoanRepayment(Long repaymentId, String reference, String account,
                                  BigDecimal amount, LocalDate date) {
        if (repaymentId != null && repo.existsBySourceTypeAndSourceId("loan_in", repaymentId)) {
            return;
        }
        FinanceEntry e = FinanceEntry.builder()
                .entryDate(date == null ? LocalDate.now() : date)
                .refId(reference == null || reference.isBlank() ? null : reference)
                .category(LedgerCategory.LOAN)
                .account(account == null || account.isBlank() ? "Loan repayment" : account.trim())
                .amount(nz(amount))
                .status(LedgerStatus.SETTLED)
                .note("Loan repayment recovered from worker")
                .sourceType("loan_in")
                .sourceId(repaymentId)
                .build();
        repo.save(e);
    }

    // The Money Movement feed: every auto-posted line, newest first, with
    // footer totals. kind is one of payroll | withdrawal | loan_out | loan_in,
    // or blank for all.
    public ActivityPageResponse activity(int page, int size, String kind) {
        int p = Math.max(page, 0);
        int s = size <= 0 ? 10 : Math.min(size, 200);
        String k = blank(kind);
        Page<FinanceEntry> result = repo.activity(k, PageRequest.of(p, s));
        // One extra query per page: of the loan_in rows on this page, which came
        // out of a payslip rather than out of the worker's pocket.
        java.util.Set<Long> wageDeducted = wageDeductedRepaymentIds(result.getContent());
        List<ActivityEntryResponse> entries = result.getContent().stream()
                .map(e -> ActivityEntryResponse.from(e,
                        "loan_in".equals(e.getSourceType())
                                && e.getSourceId() != null
                                && wageDeducted.contains(e.getSourceId())))
                .toList();
        var totals = repo.activityTotals(k);
        return new ActivityPageResponse(entries, p, s,
                result.getTotalElements(), result.getTotalPages(),
                totals == null ? BigDecimal.ZERO : nz(totals.getTotalOut()),
                totals == null ? BigDecimal.ZERO : nz(totals.getTotalIn()));
    }

    // Undo a loan repayment that was recorded and then found not to have
    // happened -- the day it came from was corrected after settlement.
    //
    // A COMPENSATING ROW, NOT A DELETED ONE. The original loan_in stays exactly
    // where it is. Erasing it would leave a loan balance that no longer matches
    // its own repayment history, and would be indistinguishable from somebody
    // removing an inconvenient number.
    //
    // amount stays >= 0 (chk_finance_amount_nonneg). Direction is carried by
    // source_type = 'loan_in_reversal', which the cashOnHand rollup reads --
    // and which is cash-NEUTRAL when the original repayment was withheld from
    // wages, because no cash moved in either direction.
    //
    // Idempotent on (loan_in_reversal, repaymentId): reversing twice is a no-op.
    public void postLoanRepaymentReversal(Long repaymentId, String reference, String account,
                                          BigDecimal amount, LocalDate date, String reason) {
        if (repaymentId != null
                && repo.existsBySourceTypeAndSourceId("loan_in_reversal", repaymentId)) {
            return;
        }
        FinanceEntry e = FinanceEntry.builder()
                .entryDate(date == null ? LocalDate.now() : date)
                .refId(reference == null || reference.isBlank() ? null : reference)
                .category(LedgerCategory.LOAN)
                .account(account == null || account.isBlank() ? "Loan repayment reversed" : account.trim())
                .amount(nz(amount))
                .status(LedgerStatus.SETTLED)
                .note(reason == null || reason.isBlank()
                        ? "Loan repayment reversed - the day it came from was corrected"
                        : "Loan repayment reversed - " + reason)
                .sourceType("loan_in_reversal")
                .sourceId(repaymentId)
                .build();
        repo.save(e);
    }

    // ---- helpers ----

    // For the loan_in rows in this page, source_id is the loan_repayment_entry
    // id. Returns the subset that was WITHHELD FROM WAGES -- by a payslip
    // (legacy) or by daily settlement -- and therefore moved no cash.
    private java.util.Set<Long> wageDeductedRepaymentIds(List<FinanceEntry> rows) {
        java.util.Set<Long> ids = new java.util.HashSet<>();
        for (FinanceEntry e : rows) {
            if ("loan_in".equals(e.getSourceType()) && e.getSourceId() != null) {
                ids.add(e.getSourceId());
            }
        }
        if (ids.isEmpty()) {
            return java.util.Set.of();
        }
        java.util.Set<Long> out = new java.util.HashSet<>();
        repaymentRepository.findWageWithheld(ids)
                .forEach(r -> out.add(r.getId()));
        return out;
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

    // Signed month-over-month percentage change (rounded to 1 decimal).
    private static double pct(BigDecimal prev, BigDecimal curr) {
        if (prev == null || prev.signum() == 0) {
            return (curr != null && curr.signum() > 0) ? 100.0 : 0.0;
        }
        return curr.subtract(prev)
                .divide(prev.abs(), 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(1, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private static double percent(BigDecimal part, BigDecimal total) {
        return part.divide(total, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(1, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private static String monthLabel(String ym) {
        try {
            return YearMonth.parse(ym).getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
        } catch (Exception ex) {
            return ym;
        }
    }

    private static LedgerCategory parseCategory(String v) {
        try {
            return LedgerCategory.valueOf(v.trim().toUpperCase());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid category");
        }
    }

    private static LedgerStatus parseStatus(String v) {
        if (v == null || v.isBlank()) return LedgerStatus.SETTLED;
        try {
            return LedgerStatus.valueOf(v.trim().toUpperCase());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status");
        }
    }
}
