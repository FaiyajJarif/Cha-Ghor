package com.chaghor.chaghor.leaf;

import com.chaghor.chaghor.leaf.dto.LeafGradeSuggestion;
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

import java.math.BigDecimal;
import java.math.RoundingMode;
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

// Leaf-quality grading from a photograph.
//
// ADVISORY, AND THAT IS THE DESIGN, NOT A LIMITATION. Grade A pays a bonus per
// kilo. Letting a model set the grade would move money on its read of a phone
// photo taken at a field scale, often in poor light, of leaf held at arm's
// length. This endpoint returns a suggestion and stores it; the supervisor
// picks the grade on the weigh-in row as they always did.
//
// Every suggestion is written to vision_inference whether or not it is
// accepted, because the only way to find out if the grader is any good is to
// keep a record of what it claimed.
@Service
public class LeafGradingService {

    private static final Logger log = LoggerFactory.getLogger(LeafGradingService.class);

    // A phone photo is around 2-5 MB. Beyond this it is not a photo of leaf.
    private static final long MAX_BYTES = 12L * 1024 * 1024;
    // Below this the model is guessing, and the UI says so rather than
    // presenting a coin-flip as a grade.
    private static final BigDecimal LOW_CONFIDENCE = new BigDecimal("0.60");

    private final VisionInferenceRepository visionRepo;
    // Reuses the case-attachment store: same magic-byte checks, same safe
    // filenames, same on-disk root. A second uploader would be a second set of
    // the same bugs.
    private final com.chaghor.chaghor.fieldcase.CaseAttachmentService attachments;
    private final ObjectMapper mapper = new ObjectMapper();
    // HTTP/1.1 is REQUIRED: Java defaults to HTTP/2, uvicorn cannot do h2c, and
    // the body arrives mangled as a 422. See MonthReviewService.
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(8))
            .build();
    private final String aiBaseUrl;

    public LeafGradingService(VisionInferenceRepository visionRepo,
                              com.chaghor.chaghor.fieldcase.CaseAttachmentService attachments,
                              @Value("${app.ai.service.url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.visionRepo = visionRepo;
        this.attachments = attachments;
        this.aiBaseUrl = aiBaseUrl.replaceAll("/+$", "");
    }

    @Transactional
    public LeafGradeSuggestion grade(MultipartFile file, String subjectRef) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attach a photo of the leaf.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "That image is too large. Take the photo at normal quality and try again.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType();
        if (!contentType.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only a photograph can be graded.");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read that image.");
        }

        // The PHOTO IS THE POINT, the grade is a bonus. Store the image before
        // calling the model, so a weigh-in still has its evidence attached when
        // the AI service is down -- proof the worker handed in that bulk is
        // worth more than a machine's opinion about it.
        String imageUrl = null;
        try {
            imageUrl = "/api/v1/complaints/attachments/" + attachments.store(file);
        } catch (Exception e) {
            log.warn("Could not store leaf photo: {}", e.toString());
        }

        JsonNode res;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("filename", file.getOriginalFilename());
            body.put("content_type", contentType);
            body.put("data_base64", Base64.getEncoder().encodeToString(bytes));

            HttpRequest req = HttpRequest.newBuilder(URI.create(aiBaseUrl + "/leaf-grade"))
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
                String detail = resp.body() == null ? "" : resp.body().strip();
                if (detail.length() > 300) detail = detail.substring(0, 300) + "…";
                throw new IllegalStateException("HTTP " + resp.statusCode()
                        + (detail.isEmpty() ? "" : ": " + detail));
            }
            res = mapper.readTree(resp.body());
        } catch (Exception e) {
            log.warn("Leaf grading unavailable: {}", e.toString());
            // Do NOT throw. The photo is saved and is the part that matters;
            // returning it with no grade lets the supervisor attach evidence and
            // set the grade by hand, which is the normal path anyway.
            VisionInference row = visionRepo.save(VisionInference.builder()
                    .subjectType(VisionSubject.leaf_grade)
                    .subjectRef(subjectRef)
                    .imageUrl(imageUrl)
                    .model("unavailable")
                    .build());
            return new LeafGradeSuggestion(null, BigDecimal.ZERO, List.of(),
                    List.of(explain(e)), null, row.getId(), imageUrl,
                    "Photo saved. Set the grade yourself — the grader is not available.");
        }

        String grade = res.path("grade").isNull() ? null : res.path("grade").asText(null);
        if (grade != null && !grade.equals("A") && !grade.equals("B")) {
            grade = null; // anything the model invented is not a grade
        }
        BigDecimal confidence = BigDecimal.valueOf(res.path("confidence").asDouble(0.0))
                .setScale(4, RoundingMode.HALF_UP);
        List<String> observations = strings(res.path("observations"));
        List<String> concerns = strings(res.path("concerns"));
        String provider = res.path("provider").asText("");

        // Stored whether or not it is accepted — this table is the record of
        // what the model claimed, which is what makes it auditable later.
        VisionInference row = visionRepo.save(VisionInference.builder()
                .subjectType(VisionSubject.leaf_grade)
                .subjectRef(subjectRef)
                .imageUrl(imageUrl)
                .label(grade)
                .confidence(confidence)
                .model(provider)
                .build());

        String advice;
        if (grade == null) {
            advice = "The photo could not be graded. Set the grade yourself from the leaf in front of you.";
        } else if (confidence.compareTo(LOW_CONFIDENCE) < 0) {
            advice = "Looks like grade " + grade + ", but the model is not confident. Check it yourself before accepting.";
        } else {
            advice = "Suggests grade " + grade + ". You still set the grade — this does not change anything on its own.";
        }

        return new LeafGradeSuggestion(grade, confidence, observations, concerns,
                provider, row.getId(), imageUrl, advice);
    }

    private List<String> strings(JsonNode arr) {
        List<String> out = new ArrayList<>();
        if (arr != null && arr.isArray()) {
            arr.forEach(n -> out.add(n.asText("")));
        }
        out.removeIf(String::isBlank);
        return out;
    }

    // Name the fix, not just the failure.
    private String explain(Exception e) {
        String m = String.valueOf(e.getMessage());
        if (e instanceof java.net.ConnectException || m.contains("Connection refused") || m.contains("connect")) {
            return "The AI service is not answering at " + aiBaseUrl
                    + ". Start it with: cd ai_service && uvicorn main:app --port 8000.";
        }
        if (m.contains("HTTP 503")) {
            return "No vision model is available. Leaf grading needs Gemini — check the key in "
                    + "ai_service/.env. The local Ollama model in this stack cannot read images.";
        }
        if (m.contains("timed out") || e instanceof java.net.http.HttpTimeoutException) {
            return "The vision model took too long to answer.";
        }
        return "Leaf grading is unavailable (" + m + ").";
    }
}
