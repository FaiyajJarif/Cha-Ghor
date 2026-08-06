package com.chaghor.chaghor.chatbot.dto;

// The Cha Bot answer plus the SQL it ran (shown to the admin for transparency)
// and which model(s) produced it.
public record AskResponse(String answer, String sql, Integer rowCount, String provider) {
}
