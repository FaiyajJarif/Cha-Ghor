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

    // A worker (or an admin on their behalf) files a cash-out request.
    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR','WORKER')")
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
