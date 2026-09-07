package com.chaghor.chaghor.withdrawal;

import com.chaghor.chaghor.withdrawal.dto.NewWithdrawalRequest;
import com.chaghor.chaghor.withdrawal.dto.WithdrawalResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/withdrawals")
@RequiredArgsConstructor
public class WithdrawalController {

    private final WithdrawalService service;

    // Admin/supervisor queue. Defaults to pending when no status is given.
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public List<WithdrawalResponse> list(@RequestParam(required = false) String status) {
        return service.list(status);
    }

    // An admin or supervisor files a cash-out request ON BEHALF OF a worker.
    //
    // WORKER WAS REMOVED FROM THIS ENDPOINT, DELIBERATELY. DO NOT PUT IT BACK.
    //
    // `workerId` comes from the request body, which is correct for an office
    // user -- they are entitled to act for any worker, and the body is the only
    // way to say which. It is a hole for a worker: passing a colleague's id
    // files an advance against THAT colleague's wages, and the recovery lands
    // on their payslip. The victim's pay drops and nothing on their screen
    // explains why.
    //
    // Workers use POST /api/v1/me/worker/advances instead, which takes no id at
    // all -- it resolves the worker from the JWT and additionally enforces the
    // advance cap and the one-open-request rule. See MeWorkerController's header
    // for why that tier has no id parameters anywhere.
    //
    // Nothing in the frontend called this as a worker; the worker UI has always
    // used the /me/worker path. Removing the role closes the gap without
    // changing any behaviour that was in use.
    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public WithdrawalResponse create(@Valid @RequestBody NewWithdrawalRequest req) {
        return service.create(req);
    }

    // Admin decides: {"action":"pay"} or {"action":"reject"}.
    @PostMapping("/{id}/decide")
    @PreAuthorize("hasRole('ADMIN')")
    public WithdrawalResponse decide(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String action = (body != null) ? body.get("action") : null;
        return service.decide(id, action);
    }
}
