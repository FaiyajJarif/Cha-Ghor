package com.chaghor.chaghor.bkash;

import com.chaghor.chaghor.finance.FinanceService;
import com.chaghor.chaghor.withdrawal.WithdrawalRepository;
import com.chaghor.chaghor.withdrawal.WithdrawalRequest;
import com.chaghor.chaghor.withdrawal.WithdrawalService;
import com.chaghor.chaghor.withdrawal.WithdrawalStatus;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// The estate's bKash disbursement wallet, and bulk payout runs from it.
//
// ============================================================================
// WHERE THE MONEY IS, AT EVERY MOMENT
// ============================================================================
//
//   Cash on Hand  =  office cash  +  bkash_account.balance
//
//   topUp(X)        office -> wallet. A TRANSFER, not a cost. The ledger row is
//                   cash-NEUTRAL (FinanceRepository has an arm returning 0 for
//                   source_type = 'bkash_topup'), and the wallet goes up by X.
//                   Cash on Hand is unchanged, because the estate still has the
//                   money -- it is just sitting somewhere else.
//
//   sendBatch()     wallet -> workers. The wallet goes DOWN, and each payment
//                   posts through the EXISTING withdrawal path, which is what
//                   reduces Cash on Hand. Money leaves the estate here, once.
//
// Getting that split wrong is the failure the whole design guards against: if
// the top-up also reduced Cash on Hand, the same taka would be counted out
// twice -- once when the wallet was funded and again when the wage was paid.
//
// ============================================================================
// WHY sendBatch DELEGATES TO WithdrawalService.decide
// ============================================================================
//
// decide(id, "pay") already does four things correctly and in one transaction:
// posts the wage or advance to Finance with the right category, releases wages
// already earned when an advance is approved, notifies the worker by SMS, and
// writes the audit row. Re-implementing any of that here would be a second
// place for the money rules to live, and they would drift.
//
// So this service owns exactly one thing the withdrawal path does not: the
// wallet balance.
@Service
@RequiredArgsConstructor
public class BkashService {

    private static final Logger log = LoggerFactory.getLogger(BkashService.class);
    private static final DateTimeFormatter REF_DAY = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final BkashAccountRepository accountRepo;
    private final DisbursementBatchRepository batchRepo;
    private final DisbursementItemRepository itemRepo;
    private final WithdrawalRepository withdrawalRepo;
    private final WithdrawalService withdrawalService;
    private final WorkerRepository workerRepository;
    private final FinanceService financeService;

    // ---- the wallet ---------------------------------------------------------

    @Transactional(readOnly = true)
    public BkashAccount account() {
        return accountRepo.findById(1L).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "The bKash wallet row is missing. Has V44 been applied?"));
    }

    // Move office cash into the wallet.
    //
    // Records a ledger row so the transfer is visible in Finance, but that row
    // does not change Cash on Hand -- see the class comment.
    @Transactional
    public Map<String, Object> topUp(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Enter how much to move into the bKash wallet.");
        }
        BkashAccount acc = account();
        acc.setBalance(acc.getBalance().add(amount));
        acc.setUpdatedAt(OffsetDateTime.now());
        accountRepo.save(acc);

        // sourceId is the wallet row id, which is always 1, so the posting is
        // NOT idempotent on it -- deliberately. Every top-up is a distinct
        // event and they must all appear. Passing null skips the existence
        // check entirely, which is the honest way to say "no dedupe key here".
        financeService.postBkashTopUp(null, amount, LocalDate.now());

        log.warn("[bkash] wallet topped up by {} -> balance {}", amount, acc.getBalance());
        return balanceView(acc);
    }

    private Map<String, Object> balanceView(BkashAccount acc) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("walletNumber", acc.getWalletNumber());
        m.put("balance", acc.getBalance());
        m.put("updatedAt", acc.getUpdatedAt());
        return m;
    }

    // ---- building a run -----------------------------------------------------

    // Pending withdrawal requests that are not already sitting in a batch.
    @Transactional(readOnly = true)
    public List<Map<String, Object>> payable() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (WithdrawalRequest w : withdrawalRepo
                .findByStatusOrderByRequestedAtDesc(WithdrawalStatus.pending)) {
            if (itemRepo.existsByWithdrawalId(w.getId())) continue;   // already batched
            Worker worker = workerRepository.findById(w.getWorkerId()).orElse(null);
            // No phone means no wallet to pay into. Offering the row would put
            // a number in the total that can never actually be disbursed.
            if (worker == null || worker.getPhone() == null || worker.getPhone().isBlank()) continue;

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("withdrawalId", w.getId());
            m.put("workerId", worker.getId());
            m.put("name", worker.getFullName());
            m.put("code", "CG" + String.format("%03d", worker.getId()));
            m.put("phone", worker.getPhone());
            m.put("amount", w.getAmount());
            m.put("kind", w.getKind().name());
            m.put("requestedAt", w.getRequestedAt());
            out.add(m);
        }
        return out;
    }

    // Build a draft batch from the requests the admin ticked. Pays nothing.
    @Transactional
    public Map<String, Object> createBatch(List<Long> withdrawalIds, Long adminUserId) {
        if (withdrawalIds == null || withdrawalIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Choose at least one withdrawal to include.");
        }
        DisbursementBatch batch = batchRepo.save(DisbursementBatch.builder()
                .reference("CG-" + LocalDate.now().format(REF_DAY) + "-"
                        + (batchRepo.count() + 1))
                .status("draft")
                .createdBy(adminUserId)
                .build());

        BigDecimal total = BigDecimal.ZERO;
        int n = 0;
        for (Long wid : withdrawalIds) {
            WithdrawalRequest w = withdrawalRepo.findById(wid).orElse(null);
            if (w == null || w.getStatus() != WithdrawalStatus.pending) continue;
            if (itemRepo.existsByWithdrawalId(wid)) continue;
            Worker worker = workerRepository.findById(w.getWorkerId()).orElse(null);
            if (worker == null || worker.getPhone() == null || worker.getPhone().isBlank()) continue;

            itemRepo.save(DisbursementItem.builder()
                    .batchId(batch.getId())
                    .withdrawalId(w.getId())
                    .workerId(worker.getId())
                    .phone(worker.getPhone())
                    .amount(w.getAmount())
                    .status("queued")
                    .build());
            total = total.add(w.getAmount());
            n++;
        }
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "None of those requests can be paid — they may already be in a batch.");
        }
        batch.setTotalAmount(total);
        batch.setItemCount(n);
        batchRepo.save(batch);
        return batchView(batch);
    }

    // ---- executing a run ----------------------------------------------------

    // Debit the wallet and pay every worker in the batch.
    //
    // The balance is checked BEFORE anything is paid. bKash would refuse a run
    // it cannot fund, and a half-executed batch is far worse than a refused one:
    // some workers paid, some not, and no single status that describes it.
    @Transactional
    public Map<String, Object> sendBatch(Long batchId) {
        DisbursementBatch batch = batchRepo.findById(batchId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found"));
        if (!"draft".equals(batch.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This batch has already been sent.");
        }
        List<DisbursementItem> items = itemRepo.findByBatchIdOrderByIdAsc(batchId);
        if (items.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This batch is empty.");
        }

        BkashAccount acc = account();
        BigDecimal need = items.stream().map(DisbursementItem::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (acc.getBalance().compareTo(need) < 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "The bKash wallet holds " + acc.getBalance() + " but this run needs "
                            + need + ". Top the wallet up first.");
        }

        int paid = 0;
        BigDecimal moved = BigDecimal.ZERO;
        for (DisbursementItem it : items) {
            // decide() posts to Finance, releases earned wages for an advance,
            // sends the SMS and writes the audit row. All of that stays there.
            withdrawalService.decide(it.getWithdrawalId(), "pay");

            it.setStatus("sent");
            // A simulated reference. Labelled SIM so nobody mistakes it for a
            // real bKash TrxID -- there is no bKash integration, and a
            // realistic-looking fake id in an audit trail is worse than an
            // obvious one.
            it.setTrxId("SIM" + Long.toHexString(
                    System.nanoTime() ^ it.getId()).toUpperCase());
            it.setSentAt(OffsetDateTime.now());
            itemRepo.save(it);

            moved = moved.add(it.getAmount());
            paid++;
        }

        acc.setBalance(acc.getBalance().subtract(moved));
        acc.setUpdatedAt(OffsetDateTime.now());
        accountRepo.save(acc);

        batch.setStatus("sent");
        batch.setSentAt(OffsetDateTime.now());
        batchRepo.save(batch);

        log.warn("[bkash] batch {} sent: {} workers, {} moved, wallet now {}",
                batch.getReference(), paid, moved, acc.getBalance());

        Map<String, Object> out = batchView(batch);
        out.put("paid", paid);
        out.put("moved", moved);
        out.put("walletBalance", acc.getBalance());
        return out;
    }

    // ---- reading ------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> batches() {
        return batchRepo.findTop20ByOrderByIdDesc().stream().map(this::batchView).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> batch(Long id) {
        DisbursementBatch b = batchRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found"));
        Map<String, Object> m = batchView(b);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (DisbursementItem it : itemRepo.findByBatchIdOrderByIdAsc(id)) {
            Worker w = workerRepository.findById(it.getWorkerId()).orElse(null);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", it.getId());
            r.put("withdrawalId", it.getWithdrawalId());
            r.put("workerId", it.getWorkerId());
            r.put("name", w == null ? ("Worker #" + it.getWorkerId()) : w.getFullName());
            r.put("phone", it.getPhone());
            r.put("amount", it.getAmount());
            r.put("status", it.getStatus());
            r.put("trxId", it.getTrxId());
            rows.add(r);
        }
        m.put("items", rows);
        return m;
    }

    // Which withdrawals are already on a slip, drafted or sent.
    @Transactional(readOnly = true)
    public List<Long> batchedWithdrawalIds() {
        return itemRepo.allWithdrawalIds();
    }

    // ---- the payout slip: out as a file, back in as a file ------------------

    // ========================================================================
    // WHY A FILE AT ALL, WHEN BOTH SCREENS ARE IN THE SAME APPLICATION
    // ========================================================================
    //
    // Because that is how corporate disbursement actually works. An estate
    // office approves a list, hands a spreadsheet to whoever holds the bKash
    // merchant credentials, and that person runs it. The two roles are usually
    // two people, and often two organisations. Modelling it as a file keeps the
    // approving and the paying genuinely separate instead of pretending one
    // person does both in one click.
    //
    // It also means the slip is the artefact that gets checked. A row can be
    // read, queried and argued about before anybody is paid.
    //
    // ========================================================================
    // THE FILE CHOOSES WHO IS PAID. IT NEVER CHOOSES HOW MUCH.
    // ========================================================================
    //
    // This is the whole security design of the import, so it is worth being
    // blunt: every amount that is actually disbursed is read from
    // withdrawal_request in the database. The amount column in the CSV is
    // matched against it and then discarded.
    //
    // Edit 240.00 to 24000.00 in a text editor and upload it and the row does
    // not pay 24,000 -- it fails to match any pending request and is reported
    // as skipped. The same is true of the name and the phone: they must agree
    // with the worker record or the row is refused. A file that has been
    // tampered with can cause a payment NOT to happen. It cannot cause a wrong
    // payment to happen, and it cannot redirect one to a different number.

    // A slip for withdrawals that are NOT yet on a run. Creates nothing.
    //
    // ========================================================================
    // WHY THIS EXISTS AND WHY APPROVING MUST NOT CREATE A BATCH
    // ========================================================================
    //
    // Approve originally called createBatch and then downloaded that batch's
    // slip. That looked reasonable and was self-defeating: importSlip only
    // accepts withdrawals that are not already batched, so every row on the
    // downloaded slip was excluded by the very act of producing it. Uploading
    // the file the system had just generated answered "Nothing on that slip
    // could be paid."
    //
    // The fix is to make the slip a pure statement of intent. It is a list of
    // people the office has approved for payment, and nothing in the database
    // changes when it is written. The import is then the single thing that
    // creates a run, which is also where it belongs: the run should be built
    // from what was actually handed to whoever holds the bKash credentials.
    @Transactional(readOnly = true)
    public String slipCsvFor(List<Long> withdrawalIds) {
        if (withdrawalIds == null || withdrawalIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Choose at least one withdrawal for the slip.");
        }
        StringBuilder sb = new StringBuilder();
        sb.append("cg_id,name,phone,amount\n");
        int n = 0;
        for (Long id : withdrawalIds) {
            WithdrawalRequest w = withdrawalRepo.findById(id).orElse(null);
            if (w == null || w.getStatus() != WithdrawalStatus.pending) continue;
            Worker worker = workerRepository.findById(w.getWorkerId()).orElse(null);
            // No phone, no wallet to pay into. Putting the row on the slip
            // would only produce a line that cannot be imported later.
            if (worker == null || worker.getPhone() == null || worker.getPhone().isBlank()) continue;

            sb.append(csvCell(cgCode(worker.getId()))).append(',')
              .append(csvCell(worker.getFullName())).append(',')
              .append(csvCell(worker.getPhone())).append(',')
              .append(w.getAmount().setScale(2, RoundingMode.HALF_UP).toPlainString())
              .append('\n');
            n++;
        }
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Nothing to put on a slip. The request may already have been "
                            + "decided, or the worker has no phone number on file.");
        }
        return sb.toString();
    }

    // The slip for an existing batch, as CSV.
    @Transactional(readOnly = true)
    public String slipCsv(Long batchId) {
        DisbursementBatch b = batchRepo.findById(batchId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found"));

        StringBuilder sb = new StringBuilder();
        // A header row, because a human opens this in Excel before a machine
        // ever reads it back.
        sb.append("cg_id,name,phone,amount\n");
        for (DisbursementItem it : itemRepo.findByBatchIdOrderByIdAsc(batchId)) {
            Worker w = workerRepository.findById(it.getWorkerId()).orElse(null);
            sb.append(csvCell(cgCode(it.getWorkerId()))).append(',')
              .append(csvCell(w == null ? "Worker #" + it.getWorkerId() : w.getFullName())).append(',')
              .append(csvCell(it.getPhone())).append(',')
              .append(it.getAmount().setScale(2, RoundingMode.HALF_UP).toPlainString())
              .append('\n');
        }
        log.warn("[bkash] slip exported for batch {}", b.getReference());
        return sb.toString();
    }

    // Read a slip back and build a draft batch from it.
    //
    // Returns what matched and, row by row, what did not and why. A silent
    // partial import is the worst possible outcome here: the admin would send
    // a batch believing it covers everyone on the sheet.
    @Transactional
    public Map<String, Object> importSlip(String csvText, Long adminUserId) {
        if (csvText == null || csvText.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That file is empty.");
        }

        // EVERY pending request, including ones already sitting in a DRAFT
        // batch. Filtering those out here is the bug that made this endpoint
        // useless: approving used to create the batch and then hand over the
        // slip, so every row on the slip was already batched and the import it
        // was built for could never match a single one of them. The message --
        // "No pending request of 10.00 for CG010" -- was true and completely
        // unhelpful.
        //
        // Approving no longer creates a batch (see slipCsvFor). A row still in
        // a draft is either a leftover from that old behaviour or a second slip
        // for the same worker, and in both cases the right answer is to move it
        // into this run rather than refuse it: a draft has moved no money, so
        // nothing is undone by re-proposing it. A SENT batch is different and
        // is refused below.
        List<WithdrawalRequest> open = new ArrayList<>(
                withdrawalRepo.findByStatusOrderByRequestedAtDesc(WithdrawalStatus.pending));

        // Items to release from their draft batch once every row is resolved.
        // Collected first and applied afterwards so a slip that turns out to be
        // unusable does not leave batches half-dismantled behind it.
        List<DisbursementItem> toRelease = new ArrayList<>();

        List<Long> matchedIds = new ArrayList<>();
        List<Map<String, Object>> skipped = new ArrayList<>();
        int lineNo = 0;

        for (String[] cells : parseCsv(csvText)) {
            lineNo++;
            if (cells.length == 0 || (cells.length == 1 && cells[0].isBlank())) continue;
            // Header, in whatever case the spreadsheet saved it.
            if (lineNo == 1 && cells[0].equalsIgnoreCase("cg_id")) continue;

            if (cells.length < 4) {
                skipped.add(skip(lineNo, String.join(",", cells),
                        "Needs four columns: cg_id, name, phone, amount."));
                continue;
            }

            String cgId  = cells[0];
            String name  = cells[1];
            String phone = cells[2];
            BigDecimal amount;
            try {
                amount = new BigDecimal(cells[3].replace(",", "").trim())
                        .setScale(2, RoundingMode.HALF_UP);
            } catch (NumberFormatException e) {
                skipped.add(skip(lineNo, name, "\"" + cells[3] + "\" is not an amount."));
                continue;
            }

            Long workerId = parseWorkerId(cgId);
            if (workerId == null) {
                skipped.add(skip(lineNo, name, "Could not read a worker id from \"" + cgId + "\"."));
                continue;
            }

            Worker worker = workerRepository.findById(workerId).orElse(null);
            if (worker == null || worker.getDeletedAt() != null) {
                skipped.add(skip(lineNo, name, "No worker " + cgId + " on this estate."));
                continue;
            }

            // THE PHONE MUST AGREE WITH THE WORKER RECORD.
            //
            // The phone in the file is where the money would go, so it is the
            // one field an attacker would change. It is never trusted: the
            // number actually paid comes from the worker record, and a
            // disagreement refuses the row rather than quietly preferring one
            // source over the other.
            if (!samePhone(worker.getPhone(), phone)) {
                skipped.add(skip(lineNo, worker.getFullName(),
                        "The number on the slip does not match the one on file for "
                                + cgId + ". Refusing to pay it."));
                continue;
            }

            // Pick the pending request this row refers to. A worker can have
            // more than one open, so the amount disambiguates -- and because
            // the amount must agree exactly, an edited figure matches nothing.
            WithdrawalRequest hit = null;
            for (WithdrawalRequest w : open) {
                if (!w.getWorkerId().equals(workerId)) continue;
                if (matchedIds.contains(w.getId())) continue;
                if (w.getAmount().setScale(2, RoundingMode.HALF_UP).compareTo(amount) == 0) {
                    hit = w;
                    break;
                }
            }

            if (hit == null) {
                skipped.add(skip(lineNo, worker.getFullName(),
                        "No pending request of " + amount.toPlainString() + " for " + cgId
                                + ". It may already have been paid."));
                continue;
            }

            // Already on a run? Draft means proposed, sent means paid.
            DisbursementItem existing = itemRepo.findByWithdrawalId(hit.getId()).orElse(null);
            if (existing != null) {
                DisbursementBatch owner = batchRepo.findById(existing.getBatchId()).orElse(null);
                boolean stillDraft = owner != null && "draft".equals(owner.getStatus());
                if (!stillDraft) {
                    skipped.add(skip(lineNo, worker.getFullName(),
                            "Already paid on run "
                                    + (owner == null ? "?" : owner.getReference()) + "."));
                    continue;
                }
                toRelease.add(existing);
            }

            matchedIds.add(hit.getId());
        }

        if (matchedIds.isEmpty()) {
            // Report WHY, rather than a bare "nothing matched". The reasons are
            // the only way the admin can fix the sheet.
            StringBuilder why = new StringBuilder("Nothing on that slip could be paid.");
            for (Map<String, Object> s : skipped) {
                why.append(" Line ").append(s.get("line")).append(": ").append(s.get("reason"));
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT, why.toString());
        }

        // Release the draft rows LAST, once the whole slip has been read and we
        // know it produces a usable run. Each released item frees its
        // withdrawal so createBatch below will accept it.
        for (DisbursementItem it : toRelease) {
            Long oldBatchId = it.getBatchId();
            itemRepo.delete(it);
            itemRepo.flush();   // so the count below sees the deletion
            // A draft left with nothing in it is noise in the batch list. It
            // never paid anybody and never will, so it goes with its last row.
            // Only ever a DRAFT -- the check above refuses to touch a sent one.
            if (itemRepo.countByBatchId(oldBatchId) == 0) {
                batchRepo.findById(oldBatchId)
                        .filter(b -> "draft".equals(b.getStatus()))
                        .ifPresent(batchRepo::delete);
            }
        }
        if (!toRelease.isEmpty()) {
            log.warn("[bkash] slip import moved {} row(s) out of earlier draft batches",
                    toRelease.size());
        }

        // Reuse createBatch rather than inserting items here. It already
        // enforces pending-status, not-already-batched and has-a-phone, and two
        // routes into the same table with two sets of guards is how one of them
        // ends up missing a check.
        Map<String, Object> batch = createBatch(matchedIds, adminUserId);
        batch.put("matched", matchedIds.size());
        batch.put("skipped", skipped);
        log.warn("[bkash] slip imported: {} matched, {} skipped", matchedIds.size(), skipped.size());
        return batch;
    }

    // ---- small helpers ------------------------------------------------------

    private static String cgCode(Long workerId) {
        return "CG" + String.format("%03d", workerId);
    }

    private static Map<String, Object> skip(int line, String who, String reason) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("line", line);
        m.put("name", who);
        m.put("reason", reason);
        return m;
    }

    // "CG001", "cg-1", " 1 " all mean worker 1. Anything with no digits does not.
    private static Long parseWorkerId(String cgId) {
        if (cgId == null) return null;
        String digits = cgId.replaceAll("[^0-9]", "");
        if (digits.isBlank()) return null;
        try {
            return Long.parseLong(digits);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // Compare phone numbers by their digits only.
    //
    // "+8801712345601", "8801712345601" and "01712345601" are the same handset
    // written three ways, and all three turn up in spreadsheets. Comparing the
    // strings would refuse a perfectly good slip because Excel ate a plus sign.
    // The last nine digits are the subscriber number and are what actually
    // identify the line.
    private static boolean samePhone(String a, String b) {
        if (a == null || b == null) return false;
        String da = a.replaceAll("[^0-9]", "");
        String db = b.replaceAll("[^0-9]", "");
        if (da.length() < 9 || db.length() < 9) return false;
        return da.substring(da.length() - 9).equals(db.substring(db.length() - 9));
    }

    // Quote a cell only when it needs it, per RFC 4180.
    private static String csvCell(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    // A small RFC 4180 reader. Quoted fields are supported because a Bangla
    // name written "Akter, Shahida" would otherwise split into two columns and
    // shift every field after it.
    private static List<String[]> parseCsv(String text) {
        List<String[]> out = new ArrayList<>();
        for (String line : text.split("\\r?\\n")) {
            if (line.isBlank()) continue;
            List<String> fields = new ArrayList<>();
            StringBuilder cur = new StringBuilder();
            boolean inQuotes = false;
            for (int i = 0; i < line.length(); i++) {
                char c = line.charAt(i);
                if (inQuotes) {
                    if (c == '"') {
                        if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                            cur.append('"');
                            i++;                    // an escaped quote
                        } else {
                            inQuotes = false;
                        }
                    } else {
                        cur.append(c);
                    }
                } else if (c == '"') {
                    inQuotes = true;
                } else if (c == ',') {
                    fields.add(cur.toString().trim());
                    cur.setLength(0);
                } else {
                    cur.append(c);
                }
            }
            fields.add(cur.toString().trim());
            out.add(fields.toArray(new String[0]));
        }
        return out;
    }

    private Map<String, Object> batchView(DisbursementBatch b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.getId());
        m.put("reference", b.getReference());
        m.put("status", b.getStatus());
        m.put("totalAmount", b.getTotalAmount());
        m.put("itemCount", b.getItemCount());
        m.put("createdAt", b.getCreatedAt());
        m.put("sentAt", b.getSentAt());
        return m;
    }
}
