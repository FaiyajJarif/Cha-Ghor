package com.chaghor.chaghor.leaf;

import com.chaghor.chaghor.leaf.dto.LeafHealthReport;
import com.chaghor.chaghor.leaf.dto.LeafHealthReportResult;
import com.chaghor.chaghor.fieldcase.FieldCaseService;
import com.chaghor.chaghor.fieldcase.dto.CreateCaseRequest;
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
    // Raising a case is what makes this useful: a supervisor who spots a
    // problem in a field needs it to reach the office, not sit in a panel they
    // will close in ten seconds.
    private final FieldCaseService cases;
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
                             FieldCaseService cases,
                             @Value("${app.ai.service.url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.visionRepo = visionRepo;
        this.attachments = attachments;
        this.cases = cases;
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
                    // 180s for VISION, not the 75s the text callers use.
                    //
                    // ai_service allows a 150s TOTAL budget for an image (see
                    // LLM_VISION_TIMEOUT_SECONDS): a photo takes 20-40s on
                    // Gemini and 40-90s on the local 7B vision model, and
                    // Ollama serves them one at a time, so several weigh-ins in
                    // a row queue up. This must stay ABOVE that budget or the
                    // backend hangs up while the fallback is still working --
                    // which is exactly what produced a 503 on the last two
                    // photos of a batch while the first four graded fine.
                    .timeout(Duration.ofSeconds(180))
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

    // ---- examine, then tell the admin ---------------------------------------

    // Photograph a problem in the field, get a diagnosis, and file it as a case
    // in one action.
    //
    // The case goes through the SAME FieldCase module as everything else, so it
    // lands in admin Reports & Complaints beside every other issue rather than
    // in a leaf-only inbox nobody checks. The photo is attached as evidence.
    //
    // PRIORITY IS DERIVED FROM SEVERITY, NOT CHOSEN BY THE MODEL: a SEVERE
    // reading raises a HIGH case, MODERATE a MEDIUM one. Anything healthier is
    // still filed if the supervisor asked for it, at LOW -- because a person
    // who thought it was worth reporting may be seeing something the model did
    // not.
    @Transactional
    public LeafHealthReportResult assessAndReport(MultipartFile file, String zone,
                                                  String note, Long userId,
                                                  String userName, String role) {
        LeafHealthReport a = assess(file, zone == null ? null : "zone:" + zone);

        // A photo that could not be judged still gets filed. The supervisor saw
        // something; the model failing to name it does not make the field fine.
        String severity = a.healthBand() == null ? "UNKNOWN" : a.healthBand();
        String priority = switch (severity) {
            case "SEVERE" -> "HIGH";
            case "MODERATE" -> "MEDIUM";
            default -> "LOW";
        };

        StringBuilder body = new StringBuilder();
        if (note != null && !note.isBlank()) {
            body.append(note.trim()).append("\n\n");
        }
        body.append("Reported from the leaf collection screen.\n");
        if (a.healthScore() != null) {
            body.append("Leaf condition score: ").append(a.healthScore())
                    .append("/100 (").append(severity.toLowerCase()).append(").\n");
        }
        if (!a.candidates().isEmpty()) {
            body.append("\nMost likely causes, as read from the photo:\n");
            for (LeafHealthReport.Candidate c : a.candidates()) {
                body.append("  - ").append(c.condition())
                        .append(" (").append(Math.round((c.likelihood() == null ? 0 : c.likelihood()) * 100))
                        .append("%)");
                if (c.why() != null && !c.why().isBlank()) {
                    body.append(" — ").append(c.why());
                }
                body.append("\n");
            }
        }
        if (!a.observations().isEmpty()) {
            body.append("\nWhat the photo shows:\n");
            a.observations().forEach(o -> body.append("  - ").append(o).append("\n"));
        }
        // Said plainly in the case body, because an admin reading this later
        // has no other way to know how much weight to put on it.
        body.append("\nThis is an AI reading of one photograph, not a diagnosis. ")
                .append("No treatment or chemical is recommended — have the field inspected.");

        String title = a.candidates().isEmpty()
                ? "Leaf problem reported" + (zone == null ? "" : " in " + zone)
                : "Possible " + a.candidates().get(0).condition()
                        + (zone == null ? "" : " in " + zone);

        try {
            var created = cases.create(new CreateCaseRequest(
                    "REPORT", "Field condition", title, body.toString(),
                    null, zone, priority, a.imageUrl()), userId, userName, role);
            return new LeafHealthReportResult(a, created.id(), created.title(), null);
        } catch (Exception e) {
            log.warn("Leaf health report could not be filed: {}", e.toString());
            // The examination succeeded. Say the filing did not, rather than
            // letting the supervisor believe the office has been told.
            return new LeafHealthReportResult(a, null, null,
                    "The leaf was examined but the report could not be filed. "
                            + "Raise it from Broadcast instead.");
        }
    }
}
