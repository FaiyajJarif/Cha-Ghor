package com.chaghor.chaghor.withdrawal;

// Matches the Postgres native enum `withdrawal_status` ('pending','paid','rejected').
public enum WithdrawalStatus {
    pending,
    paid,
    rejected
}
