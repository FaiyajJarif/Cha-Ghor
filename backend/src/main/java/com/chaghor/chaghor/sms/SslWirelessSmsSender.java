package com.chaghor.chaghor.sms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

// REAL provider stub for SSL Wireless (sms.sslwireless.com). Active only when
// `sms.provider=sslwireless`. Not implemented -- returns failed. Same pattern as
// BulkSmsBdSmsSender: fill in the HTTP call + config-driven credentials at go-live.
@Component
@ConditionalOnProperty(name = "sms.provider", havingValue = "sslwireless")
public class SslWirelessSmsSender implements SmsSender {

    private static final Logger log = LoggerFactory.getLogger(SslWirelessSmsSender.class);

    @Override
    public String providerName() {
        return "sslwireless";
    }

    @Override
    public SmsSendResult send(String phone, String message) {
        // TODO (go-live): POST https://smsplus.sslwireless.com/api/v3/send-sms
        //   with api_token / sid from config; parse response; return sent(...)/failed(...).
        log.warn("[SSLWireless] provider selected but not configured; message NOT sent to {}", phone);
        return SmsSendResult.failed("sslwireless provider not configured");
    }
}
