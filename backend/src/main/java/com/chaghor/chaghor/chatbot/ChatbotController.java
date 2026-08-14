package com.chaghor.chaghor.chatbot;

import com.chaghor.chaghor.chatbot.dto.AskRequest;
import com.chaghor.chaghor.chatbot.dto.AskResponse;
import com.chaghor.chaghor.chatbot.dto.ExtractWorkerResponse;
import com.chaghor.chaghor.security.AppUserDetails;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

// Thin proxy in front of the FastAPI ai_service. It injects the caller's role
// and user id from the JWT/session (never trusts the client) and enforces RBAC.
@RestController
@RequestMapping("/api/v1/chatbot")
@RequiredArgsConstructor
public class ChatbotController {

    private final ChatbotService chatbotService;

    // Read-only Q&A. Admin + supervisor may ask workforce questions.
    @PostMapping("/ask")
    @PreAuthorize("hasAnyRole('ADMIN','SUPERVISOR')")
    public AskResponse ask(@Valid @RequestBody AskRequest req,
                           @AuthenticationPrincipal AppUserDetails principal) {
        String role = principal.getUser().getRole().name();
        Long userId = principal.getUser().getId();
        return chatbotService.ask(req.question(), role, userId);
    }

    // Add-Worker autofill. Only an admin can enroll workers, so only an admin
    // may run extraction.
    @PostMapping(value = "/extract-worker", consumes = "multipart/form-data")
    @PreAuthorize("hasRole('ADMIN')")
    public ExtractWorkerResponse extractWorker(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file uploaded");
        }
        return chatbotService.extractWorker(file);
    }
}
