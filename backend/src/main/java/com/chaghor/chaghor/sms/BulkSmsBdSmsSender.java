package com.chaghor.chaghor.sms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

// REAL provider stub for BulkSMSBD (https://bulksmsbd.net). Active only when
// `sms.provider=bulksmsbd`. Intentionally NOT implemented -- it returns failed
// so a demo never silently claims a real SMS went out. When you go live, drop
// the actual HTTP call in send(...) and read the api key / sender id from config.
@Component
@ConditionalOnProperty(name = "sms.provider", havingValue = "bulksmsbd")
public class BulkSmsBdSmsSender implements SmsSender {

    private static final Logger log = LoggerFactory.getLogger(BulkSmsBdSmsSender.class);

    @Override
    public String providerName() {
        return "bulksmsbd";
    }

    @Override
    public SmsSendResult send(String phone, String message) {
        // TODO (go-live): real integration, e.g.
        //   GET/POST https://bulksmsbd.net/api/smsapi
        //     ?api_key=${sms.bulksmsbd.api-key}
        //     &senderid=${sms.bulksmsbd.sender-id}
        //     &number=<phone>&message=<urlencoded message>
        //   parse the JSON response; return SmsSendResult.sent(...) on success.
        log.warn("[BulkSMSBD] provider selected but not configured; message NOT sent to {}", phone);
        return SmsSendResult.failed("bulksmsbd provider not configured");
    }
}
