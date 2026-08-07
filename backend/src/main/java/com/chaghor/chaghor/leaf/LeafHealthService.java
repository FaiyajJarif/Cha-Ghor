package com.chaghor.chaghor.leaf;

import com.chaghor.chaghor.leaf.dto.LeafHealthReport;
import com.chaghor.chaghor.fieldcase.CaseAttachmentService;
import com.chaghor.chaghor.vision.VisionInference;
import com.chaghor.chaghor.vision.VisionInferenceRepository;
import com.chaghor.chaghor.vision.VisionSubject;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Leaf health assessment: what is WRONG with the leaf, if anything.
//
// This is the half that answers "is it fungused, is it affected". It works on a
// photo of leaf STILL ON THE BUSH -- which is exactly the photo the pluck
// grader refuses, because you cannot grade a pluck that has not happened.
// The two endpoints answer different questions about different photographs.
//
// Everything the model returns is bounded on the Python side (three candidates,
// likelihoods clamped, chemical advice stripped). This service persists the
// result to vision_inference so every claim can later be compared against what
// a supervisor decided -- which is what turns daily use into training data.
@Service
public class LeafHealthService {

    private static final Logger log = LoggerFactory.getLogger(LeafHealthService.class);
    private static final long MAX_BYTES = 12L * 1024 * 1024;

    private final VisionInferenceRepository visionRepo;
    private final CaseAttachmentService attachments;
    private final ObjectMapper mapper = new ObjectMapper();
    // HTTP/1.1 required -- uvicorn cannot do the h2c upgrade Java's default
    // HTTP/2 client attaches, and the body arrives mangled as a 422.
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(8))
            .build();
    private final String aiBaseUrl;

    public LeafHealthService(VisionInferenceRepository visionRepo,
                             CaseAttachmentService attachments,
                             @Value("${app.ai.service.url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.visionRepo = visionRepo;
        this.attachments = attachments;
        this.aiBaseUrl = aiBaseUrl.replaceAll("/+$", "");
    }

    @Transactional
    public LeafHealthReport assess(MultipartFile file, String subjectRef) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attach a photo of the leaf.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That image is too large. Take the photo at normal quality and try again.");
        }
        String ct = file.getContentType() == null ? "" : file.getContentType();
        if (!ct.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only a photograph can be examined.");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read that image.");
        }

        // Store first: the photo is evidence of the field's condition on a date,
        // and keeps its value even if the model never answers.
        String imageUrl = null;
        try {
            imageUrl = "/api/v1/complaints/attachments/" + attachments.store(file);
        } catch (Exception e) {
            log.warn("Could not store leaf health photo: {}", e.toString());
        }

        JsonNode res;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("filename", file.getOriginalFilename());
            body.put("content_type", ct);
            body.put("data_base64", Base64.getEncoder().encodeToString(bytes));

            HttpRequest req = HttpRequest.newBuilder(URI.create(aiBaseUrl + "/leaf-health"))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(60))
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                String d = resp.body() == null ? "" : resp.body().strip();
                if (d.length() > 300) d = d.substring(0, 300) + "…";
                throw new IllegalStateException("HTTP " + resp.statusCode() + (d.isEmpty() ? "" : ": " + d));
            }
            res = mapper.readTree(resp.body());
        } catch (Exception e) {
            log.warn("Leaf health assessment unavailable: {}", e.toString());
            VisionInference row = save(subjectRef, imageUrl, null, null, null, "unavailable", null);
            return new LeafHealthReport(false, "service_unavailable", null, null,
                    List.of(), List.of(), explain(e), null, row.getId(), imageUrl);
        }

        boolean usable = res.path("usable").asBoolean(false);
        String refused = res.path("refusedReason").isNull() ? null
                : res.path("refusedReason").asText(null);
        Integer score = res.path("healthScore").isNull() ? null
                : res.path("healthScore").asInt();
        String band = res.path("healthBand").isNull() ? null
                : res.path("healthBand").asText(null);
        String provider = res.path("provider").asText("");

        List<LeafHealthReport.Candidate> candidates = new ArrayList<>();
        for (JsonNode c : res.path("candidates")) {
            candidates.add(new LeafHealthReport.Candidate(
                    c.path("condition").asText(""),
                    c.path("likelihood").asDouble(0.0),
                    c.path("why").asText("")));
        }
        List<String> obs = new ArrayList<>();
        res.path("observations").forEach(n -> obs.add(n.asText("")));
        obs.removeIf(String::isBlank);

        String topCondition = candidates.isEmpty() ? null : candidates.get(0).condition();
        String candidatesJson = null;
        try {
            candidatesJson = mapper.writeValueAsString(candidates);
        } catch (Exception ignored) {
            // A blob we cannot serialise is not worth failing the reading for.
        }
        VisionInference row = save(subjectRef, imageUrl, score, band, topCondition,
                provider, candidatesJson);
        if (refused != null) {
            row.setRefusedReason(refused);
            visionRepo.save(row);
        }

        return new LeafHealthReport(usable, refused, score, band, candidates, obs,
                res.path("advice").asText(""), provider, row.getId(), imageUrl);
    }

    private VisionInference save(String ref, String imageUrl, Integer score, String band,
                                 String label, String model, String candidatesJson) {
        return visionRepo.save(VisionInference.builder()
                .subjectType(VisionSubject.leaf_grade)
                .subjectRef(ref)
                .imageUrl(imageUrl)
                .label(label)
                .healthScore(score)
                .healthBand(band)
                .candidatesJson(candidatesJson)
                .model(model)
                .build());
    }

    private String explain(Exception e) {
        String m = String.valueOf(e.getMessage());
        if (e instanceof java.net.ConnectException || m.contains("Connection refused") || m.contains("connect")) {
            return "The AI service is not answering at " + aiBaseUrl
                    + ". Start it with: cd ai_service && uvicorn main:app --port 8000.";
        }
        if (m.contains("HTTP 503")) {
            return "No vision model is available. This needs Gemini — check the key in ai_service/.env.";
        }
        return "Leaf health assessment is unavailable (" + m + ").";
    }
}
