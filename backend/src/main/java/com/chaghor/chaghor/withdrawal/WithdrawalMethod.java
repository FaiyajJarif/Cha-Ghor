package com.chaghor.chaghor.withdrawal;

// Matches the Postgres native enum `withdrawal_method`. Only bKash exists in
// v1, and the payout itself is a MOCK (demo only).
public enum WithdrawalMethod {
    bkash
}
