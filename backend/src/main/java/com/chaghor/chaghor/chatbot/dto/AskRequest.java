package com.chaghor.chaghor.chatbot.dto;

import jakarta.validation.constraints.NotBlank;

// A natural-language question from the admin/supervisor chat widget.
public record AskRequest(@NotBlank String question) {
}
