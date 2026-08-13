package com.chaghor.chaghor.chatbot;

import com.chaghor.chaghor.chatbot.dto.AskResponse;
import com.chaghor.chaghor.chatbot.dto.ExtractWorkerResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Calls the FastAPI ai_service over plain HTTP (JDK HttpClient -- no extra
// dependency). The uploaded document is forwarded as base64 JSON so we never
// have to hand-roll multipart.
@Service
public class ChatbotService {

    private final String aiBaseUrl;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();

    public ChatbotService(@Value("${app.ai.service.url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.aiBaseUrl = aiBaseUrl.replaceAll("/+$", "");
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public AskResponse ask(String question, String role, Long userId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("question", question);
        payload.put("role", role);
        payload.put("user_id", userId);
        Map<String, Object> res = post("/ask", payload, 75);
        Integer rowCount = res.get("row_count") instanceof Number n ? n.intValue() : null;
        return new AskResponse(str(res.get("answer")), str(res.get("sql")), rowCount, str(res.get("provider")));
    }

    @SuppressWarnings("unchecked")
    public ExtractWorkerResponse extractWorker(MultipartFile file) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("filename", file.getOriginalFilename());
        payload.put("content_type", file.getContentType());
        try {
            payload.put("data_base64", Base64.getEncoder().encodeToString(file.getBytes()));
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the uploaded file");
        }
        Map<String, Object> res = post("/extract-worker", payload, 90);
        Object fields = res.get("fields");
        Object warnings = res.get("warnings");
        Map<String, Object> fieldMap = fields instanceof Map ? (Map<String, Object>) fields : Map.of();
        List<String> warnList = warnings instanceof List ? (List<String>) warnings : List.of();
        return new ExtractWorkerResponse(fieldMap, warnList, str(res.get("provider")));
    }

    // Ask the AI service to turn an aggregate KPI map into a narrative report.
    // Only anonymised aggregates are sent (no individual rows). Returns null if
    // the service gives back nothing, so the caller can fall back to a template.
    public String reportNarrative(Map<String, Object> metrics, String language, String periodLabel) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("metrics", metrics);
        payload.put("language", language == null ? "en" : language);
        payload.put("period_label", periodLabel);
        Map<String, Object> res = post("/report", payload, 75);
        return str(res.get("summary"));
    }

    // Ask the AI service to review payroll / loan rows and report what looks
    // wrong. The service reads the rows itself, through the same curated
    // read-only views as everything else. The raw map is returned as-is so the
    // caller can validate every flag against the real database before trusting
    // it -- see AnomalyService.
    public Map<String, Object> detectAnomalies(String scope, int limit) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("scope", scope);
        payload.put("limit", limit);
        return post("/anomalies", payload, 120);
    }

    // Ask the AI service to judge a loan request. The FACTS are computed by
    // LoanScoringService from the estate's own records -- the model only forms
    // an opinion about them, so it can never misreport a figure. Its answer is
    // advisory; a human still approves or rejects.
    public Map<String, Object> scoreLoan(Map<String, Object> features, java.math.BigDecimal requestedAmount) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("features", features);
        payload.put("requested_amount", requestedAmount);
        return post("/loan-score", payload, 90);
    }

    // Ask the AI service to review a complaint / field report: triage it, say
    // whether it duplicates one of the candidate cases we send, summarise it in
    // the other language, and draft a reply. Every suggestion is advisory and
    // the duplicate id is re-checked by the caller.
    public Map<String, Object> reviewCase(Map<String, Object> caseData,
                                          List<Map<String, Object>> candidates,
                                          List<String> categories) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("case", caseData);
        payload.put("candidates", candidates);
        payload.put("categories", categories);
        return post("/case-review", payload, 90);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> post(String path, Map<String, Object> payload, int timeoutSeconds) {
        try {
            String body = mapper.writeValueAsString(payload);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(aiBaseUrl + path))
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "AI service error (" + resp.statusCode() + "): " + safe(resp.body()));
            }
            return mapper.readValue(resp.body(), Map.class);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (HttpConnectTimeoutException | ConnectException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The AI service is not reachable. Start ai_service (default " + aiBaseUrl + ").");
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AI service call failed: " + e.getMessage());
        }
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static String safe(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) : s;
    }
}
