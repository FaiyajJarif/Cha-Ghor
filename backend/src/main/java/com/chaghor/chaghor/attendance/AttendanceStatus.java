package com.chaghor.chaghor.attendance;

// lowercase to match the Postgres enum labels ('present','absent','leave','late')
//
// `late` was added in V22. It is stored and reported, but it is NOT counted as
// a present day by the wage formula -- PayrollService still sums only `present`
// for base pay. Whether a late day earns full, half or nothing is an estate
// policy decision, and it must not change silently just because the value
// became storable.
public enum AttendanceStatus {
    present,
    absent,
    leave,
    late
}
