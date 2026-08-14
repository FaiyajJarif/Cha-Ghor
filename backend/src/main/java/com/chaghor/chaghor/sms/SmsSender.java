package com.chaghor.chaghor.sms;

// A pluggable SMS gateway. Exactly ONE implementation is active at runtime,
// selected by the `sms.provider` property (defaults to `mock`). Swap providers
// with config only -- no code change -- because every impl is guarded by
// @ConditionalOnProperty. See MockSmsSender / BulkSmsBdSmsSender / SslWirelessSmsSender.
public interface SmsSender {

    // Short provider label stored on each sms_log row (e.g. "mock", "bulksmsbd").
    String providerName();

    // Attempt delivery. Implementations must NOT throw for a normal delivery
    // failure -- return SmsSendResult.failed(...) instead so the caller can log it.
    SmsSendResult send(String phone, String message);
}
