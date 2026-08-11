package com.chaghor.chaghor.user;

// The three states an account request can be in.
//
// PLAIN STRINGS, NOT A JAVA ENUM, because the column is VARCHAR + CHECK rather
// than a native Postgres enum (V23 explains why: an enum cannot be altered
// inside a view, and lower-case mismatches throw "invalid input value for
// enum"). Constants keep the values in one place without pretending the
// database has a type it does not.
public final class ApprovalStatus {

    public static final String PENDING = "pending";
    public static final String APPROVED = "approved";
    public static final String REJECTED = "rejected";

    private ApprovalStatus() {
    }

    public static boolean isValid(String s) {
        return PENDING.equals(s) || APPROVED.equals(s) || REJECTED.equals(s);
    }
}
