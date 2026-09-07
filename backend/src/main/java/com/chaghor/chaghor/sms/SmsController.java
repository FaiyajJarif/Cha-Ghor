package com.chaghor.chaghor.sms;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Admin-only view of the outbound SMS log. Handy for the demo: after paying a
// payslip or deciding a withdrawal, open this to SEE the (mock) message that
// would have been texted to the worker.
@RestController
@RequestMapping("/api/v1/sms")
@RequiredArgsConstructor
public class SmsController {

    private final SmsLogRepository logRepo;

    @GetMapping("/log")
    @PreAuthorize("hasRole('ADMIN')")
    public List<SmsLog> recent() {
        return logRepo.findTop50ByOrderBySentAtDesc();
    }
}
