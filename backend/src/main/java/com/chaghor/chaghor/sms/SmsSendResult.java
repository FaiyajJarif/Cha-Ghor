package com.chaghor.chaghor.sms;

// What a SmsSender reports back after attempting a send. `status` maps straight
// to the sms_status column; `detail` is a short human note for the log/console.
public record SmsSendResult(SmsStatus status, String detail) {

    public static SmsSendResult mock(String detail) {
        return new SmsSendResult(SmsStatus.mock, detail);
    }

    public static SmsSendResult sent(String detail) {
        return new SmsSendResult(SmsStatus.sent, detail);
    }

    public static SmsSendResult failed(String detail) {
        return new SmsSendResult(SmsStatus.failed, detail);
    }
}
