package com.chaghor.chaghor.sms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

// DEFAULT provider (active when `sms.provider` is unset or = "mock").
// It does NOT hit any real gateway -- it just prints the message to the server
// log and reports status = mock. The message is still persisted to sms_log by
// SmsService, so the whole flow is demoable end-to-end with zero cost/credentials.
@Component
@ConditionalOnProperty(name = "sms.provider", havingValue = "mock", matchIfMissing = true)
public class MockSmsSender implements SmsSender {

    private static final Logger log = LoggerFactory.getLogger(MockSmsSender.class);

    @Override
    public String providerName() {
        return "mock";
    }

    @Override
    public SmsSendResult send(String phone, String message) {
        log.info("[MOCK SMS] -> {} : {}", phone, message);
        return SmsSendResult.mock("logged to console (no real gateway)");
    }
}
