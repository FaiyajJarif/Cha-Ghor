package com.chaghor.chaghor.vision;

// Matches the native Postgres enum `vision_subject`. Values are LOWERCASE
// because Postgres native enums are case-sensitive and were created that way --
// sending "LEAF_GRADE" throws "invalid input value for enum vision_subject".
public enum VisionSubject {
    leaf_grade,
    pest
}
