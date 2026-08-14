package com.chaghor.chaghor.chatbot.dto;

import java.util.List;
import java.util.Map;

// Fields extracted from an uploaded worker document, used to pre-fill the
// Add Worker form. `fields` keys match the frontend form (fullName, nameBn,
// phone, nationalId, dob, joinDate, jobRole, dailyWage, zoneName).
public record ExtractWorkerResponse(Map<String, Object> fields, List<String> warnings, String provider) {
}
