package com.chaghor.chaghor.bkash;

import com.chaghor.chaghor.security.AppUserDetails;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

// Admin-only. Every route here either moves money or decides that it will, so
// none of it is reachable by a supervisor or a worker.
@RestController
@RequestMapping("/api/v1/bkash")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class BkashController {

    private final BkashService service;

    @GetMapping("/account")
    public Map<String, Object> account() {
        BkashAccount a = service.account();
        return Map.of(
                "walletNumber", a.getWalletNumber(),
                "balance", a.getBalance(),
                "updatedAt", String.valueOf(a.getUpdatedAt()));
    }

    public record TopUpRequest(BigDecimal amount) {}

    @PostMapping("/top-up")
    public Map<String, Object> topUp(@RequestBody TopUpRequest req) {
        return service.topUp(req.amount());
    }

    // Pending withdrawal requests not already sitting in a batch.
    @GetMapping("/payable")
    public List<Map<String, Object>> payable() {
        return service.payable();
    }

    // Withdrawal ids already sitting on a slip. The Withdrawals panel uses this
    // to badge a request as approved-and-awaiting-payout, which it cannot infer
    // from /payable alone (that list also drops workers with no phone).
    @GetMapping("/batched-ids")
    public List<Long> batchedIds() {
        return service.batchedWithdrawalIds();
    }

    public record CreateBatchRequest(List<Long> withdrawalIds) {}

    // Builds the spreadsheet. Pays nothing.
    @PostMapping("/batches")
    public Map<String, Object> createBatch(@AuthenticationPrincipal AppUserDetails principal,
                                           @RequestBody CreateBatchRequest req) {
        Long uid = principal == null ? null : principal.getUser().getId();
        return service.createBatch(req.withdrawalIds(), uid);
    }

    @GetMapping("/batches")
    public List<Map<String, Object>> batches() {
        return service.batches();
    }

    @GetMapping("/batches/{id}")
    public Map<String, Object> batch(@PathVariable Long id) {
        return service.batch(id);
    }

    // ---- the payout slip ----------------------------------------------------

    public record SlipRequest(List<Long> withdrawalIds) {}

    // A slip for withdrawals not yet on a run. CREATES NOTHING.
    //
    // POST because it carries a list in the body, not because it writes: this
    // is the endpoint Approve uses, and the whole point of the fix is that
    // approving records no state. The run is created when the slip is uploaded.
    @PostMapping(value = "/slip", produces = "text/csv")
    public ResponseEntity<String> slipFor(@RequestBody SlipRequest req) {
        String csv = service.slipCsvFor(req.withdrawalIds());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"payout-slip.csv\"")
                .header(HttpHeaders.CONTENT_TYPE, "text/csv; charset=UTF-8")
                .body(csv);
    }

    // Download the slip for a batch. Moves nothing; it is a list on a page.
    //
    // text/csv with an attachment filename so the browser saves it instead of
    // rendering it, and the name carries the batch reference so two slips on a
    // desktop can be told apart.
    @GetMapping(value = "/batches/{id}/slip.csv", produces = "text/csv")
    public ResponseEntity<String> slip(@PathVariable Long id) {
        String csv = service.slipCsv(id);
        String ref = String.valueOf(service.batch(id).get("reference"));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"payout-slip-" + ref + ".csv\"")
                .header(HttpHeaders.CONTENT_TYPE, "text/csv; charset=UTF-8")
                .body(csv);
    }

    // Upload a slip and build a draft batch from it. Still pays nothing --
    // importing is not paying, and the Send below remains a separate decision.
    @PostMapping("/batches/import")
    public Map<String, Object> importSlip(@AuthenticationPrincipal AppUserDetails principal,
                                          @RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a slip to upload.");
        }
        String text;
        try {
            text = new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That file could not be read.");
        }
        Long uid = principal == null ? null : principal.getUser().getId();
        return service.importSlip(text, uid);
    }

    // THE ONE THAT MOVES MONEY. Debits the wallet, pays every worker in the
    // batch through the existing withdrawal path (Finance + SMS + audit), and
    // stamps each row with a reference.
    @PostMapping("/batches/{id}/send")
    public Map<String, Object> send(@PathVariable Long id) {
        return service.sendBatch(id);
    }
}
