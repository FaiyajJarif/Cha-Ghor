package com.chaghor.chaghor.sms;

// Matches the Postgres native enum `sms_status` ('sent','failed','mock').
//  - mock   : the MockSmsSender "delivered" it (logged only, no real gateway)
//  - sent   : a real provider accepted it
//  - failed : no phone on file, or a real provider rejected it
public enum SmsStatus {
    sent,
    failed,
    mock
}
