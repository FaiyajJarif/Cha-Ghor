package com.chaghor.chaghor.attendance;

import com.chaghor.chaghor.attendance.dto.MonthReviewResponse;
import com.chaghor.chaghor.worker.Worker;
import com.chaghor.chaghor.worker.WorkerRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// "Review this month's attendance" — the button-press report.
//
// DIVISION OF LABOUR, AND IT IS THE WHOLE DESIGN: every number and every name
// on every list is counted here, in Java, from the register. The model is sent
// those finished figures and asked for one thing only — the covering paragraph.
// It is never asked who was late or how often, so it cannot get that wrong.
//
// If the AI service is unreachable the report still returns, with the lists
// intact and `narrativeError` explaining what is missing. The rankings are the
// deliverable; the prose is a courtesy.
@Service
public class MonthReviewService {

    private static final Logger log = LoggerFactory.getLogger(MonthReviewService.class);

    // Thresholds. Deliberately conservative -- a list that flags half the
    // workforce gets ignored, and an estate has good reasons for absence.
    private static final double ABSENCE_SHARE = 0.20;   // >20% of worked days absent
    private static final double LEAVE_SHARE = 0.25;     // >25% on leave
    private static final double LATE_SHARE = 0.30;      // late on >30% of days worked
    private static final int MIN_DAYS_TO_JUDGE = 5;     // never rank on a handful of rows
    private static final int TOP_N = 5;

    private final AttendanceRepository attendanceRepository;
    private final WorkerRepository workerRepository;
    private final ObjectMapper mapper = new ObjectMapper();
    // HTTP/1.1 IS REQUIRED, not a preference.
    //
    // Java's HttpClient defaults to HTTP/2, which means it attaches an h2c
    // upgrade header to a plaintext request. Uvicorn cannot do h2c: it logs
    // "Unsupported upgrade request", the body never reaches the handler intact,
    // and FastAPI answers 422 as though the JSON were malformed — which sends
    // you hunting through a payload that was correct all along.
    //
    // ChatbotService has pinned this since it was written. Copy it for any new
    // caller of the FastAPI service.
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(8))
            .build();
    private final String aiBaseUrl;

    public MonthReviewService(AttendanceRepository attendanceRepository,
                              WorkerRepository workerRepository,
                              @Value("${app.ai.service.url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.attendanceRepository = attendanceRepository;
        this.workerRepository = workerRepository;
        this.aiBaseUrl = aiBaseUrl.replaceAll("/+$", "");
    }

    @Transactional(readOnly = true)
    public MonthReviewResponse review(String month, boolean withNarrative) {
        YearMonth ym;
        try {
            ym = (month == null || month.isBlank()) ? YearMonth.now() : YearMonth.parse(month.trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Month must be written as yyyy-MM, for example 2026-08.");
        }
        LocalDate from = ym.atDay(1);
        LocalDate to = ym.atEndOfMonth();
        LocalDate today = LocalDate.now();
        LocalDate lastCountable = to.isAfter(today) ? today : to;

        Map<Long, Worker> workers = new HashMap<>();
        workerRepository.findAll().forEach(w -> workers.put(w.getId(), w));

        Map<Long, long[]> tally = new HashMap<>(); // present, late, absent, leave, lateMinutes
        for (Attendance a : attendanceRepository.findByWorkDateBetween(from, lastCountable)) {
            long[] t = tally.computeIfAbsent(a.getWorkerId(), k -> new long[5]);
            switch (a.getStatus()) {
                case present -> t[0]++;
                case late -> {
                    t[1]++;
                    t[4] += a.getLateMinutes() == null ? 0 : a.getLateMinutes();
                }
                case absent -> t[2]++;
                case leave -> t[3]++;
            }
        }

        long elapsed = lastCountable.isBefore(from) ? 0
                : (lastCountable.toEpochDay() - from.toEpochDay() + 1);

        List<MonthReviewResponse.WorkerLine> all = new ArrayList<>();
        for (Map.Entry<Long, long[]> e : tally.entrySet()) {
            Worker w = workers.get(e.getKey());
            if (w == null) continue;
            long[] t = e.getValue();
            long marked = t[0] + t[1] + t[2] + t[3];
            long notMarked = Math.max(0, elapsed - marked);
            double pct = elapsed == 0 ? 0 : Math.round((t[0] + t[1]) * 1000.0 / elapsed) / 10.0;
            all.add(new MonthReviewResponse.WorkerLine(
                    w.getId(), w.getFullName(), t[0], t[1], t[2], t[3], notMarked, t[4], pct, null));
        }

        // Only judge people with enough of a record to judge. Someone who joined
        // on the 28th should not top the absence list.
        List<MonthReviewResponse.WorkerLine> judgeable = all.stream()
                .filter(l -> l.present() + l.late() + l.absent() + l.onLeave() >= MIN_DAYS_TO_JUDGE)
                .toList();

        List<MonthReviewResponse.WorkerLine> mostPresent = judgeable.stream()
                .sorted(Comparator.comparingDouble(MonthReviewResponse.WorkerLine::attendancePct).reversed()
                        .thenComparing(Comparator.comparingLong(MonthReviewResponse.WorkerLine::present).reversed()))
                .limit(TOP_N)
                .map(l -> note(l, l.present() + l.late() + " of " + elapsed + " days worked"))
                .toList();

        List<MonthReviewResponse.WorkerLine> late = judgeable.stream()
                .filter(l -> {
                    long worked = l.present() + l.late();
                    return worked > 0 && (double) l.late() / worked > LATE_SHARE;
                })
                .sorted(Comparator.comparingLong(MonthReviewResponse.WorkerLine::late).reversed())
                .limit(TOP_N)
                .map(l -> note(l, "late " + l.late() + " of " + (l.present() + l.late()) + " days worked"
                        + (l.totalLateMinutes() > 0 ? ", " + l.totalLateMinutes() + " minutes in total" : "")))
                .toList();

        List<MonthReviewResponse.WorkerLine> absent = judgeable.stream()
                .filter(l -> {
                    long marked = l.present() + l.late() + l.absent() + l.onLeave();
                    return marked > 0 && (double) l.absent() / marked > ABSENCE_SHARE;
                })
                .sorted(Comparator.comparingLong(MonthReviewResponse.WorkerLine::absent).reversed())
                .limit(TOP_N)
                .map(l -> note(l, "absent " + l.absent() + " of "
                        + (l.present() + l.late() + l.absent() + l.onLeave()) + " recorded days"))
                .toList();

        List<MonthReviewResponse.WorkerLine> leave = judgeable.stream()
                .filter(l -> {
                    long marked = l.present() + l.late() + l.absent() + l.onLeave();
                    return marked > 0 && (double) l.onLeave() / marked > LEAVE_SHARE;
                })
                .sorted(Comparator.comparingLong(MonthReviewResponse.WorkerLine::onLeave).reversed())
                .limit(TOP_N)
                .map(l -> note(l, "on leave " + l.onLeave() + " days"))
                .toList();

        // Not a judgement about the worker at all -- a judgement about the
        // register. These are days that will pay nothing because nobody filled
        // them in, which is the estate's mistake and still fixable.
        List<MonthReviewResponse.WorkerLine> unmarked = all.stream()
                .filter(l -> l.notMarked() > 0)
                .sorted(Comparator.comparingLong(MonthReviewResponse.WorkerLine::notMarked).reversed())
                .limit(TOP_N)
                .map(l -> note(l, l.notMarked() + " day" + (l.notMarked() == 1 ? "" : "s")
                        + " never marked — these pay nothing as they stand"))
                .toList();

        String narrative = null;
        String narrativeError = null;
        if (withNarrative) {
            try {
                narrative = narrate(ym, elapsed, all.size(), mostPresent, late, absent, leave, unmarked);
            } catch (Exception ex) {
                log.warn("Attendance narrative unavailable: {}", ex.toString());
                // Say WHICH thing failed. The first version of this returned
                // one generic sentence for every cause, which told the reader
                // nothing and made a stopped service indistinguishable from a
                // missing API key.
                narrativeError = explain(ex) + " The figures below are unaffected.";
            }
        }

        return new MonthReviewResponse(ym.toString(), from, to, (int) elapsed, all.size(),
                mostPresent, late, absent, leave, unmarked, narrative, narrativeError);
    }

    // Turn the failure into something a person can act on. Each branch names a
    // different fix, which is the entire point of separating them.
    private String explain(Exception ex) {
        String msg = String.valueOf(ex.getMessage());
        if (ex instanceof java.net.ConnectException
                || msg.contains("Connection refused")
                || msg.contains("connect")) {
            return "The AI service is not answering at " + aiBaseUrl
                    + ". Start it with: cd ai_service && uvicorn main:app --port 8000.";
        }
        if (ex instanceof java.net.http.HttpTimeoutException || msg.contains("timed out")) {
            return "The AI service took too long to reply.";
        }
        if (msg.contains("HTTP 503")) {
            return "The AI service is running but has no working language model "
                    + "— check the Gemini key in ai_service/.env, or start Ollama.";
        }
        if (msg.contains("HTTP 4")) {
            return "The AI service rejected the request (" + msg + ").";
        }
        if (msg.contains("empty summary")) {
            return "The model returned nothing.";
        }
        return "The written summary could not be generated (" + msg + ").";
    }

    private static MonthReviewResponse.WorkerLine note(MonthReviewResponse.WorkerLine l, String note) {
        return new MonthReviewResponse.WorkerLine(l.workerId(), l.name(), l.present(), l.late(),
                l.absent(), l.onLeave(), l.notMarked(), l.totalLateMinutes(), l.attendancePct(), note);
    }

    // Ask the model for prose ONLY. Every figure in the payload is already
    // final; the model is not asked to compute, rank or decide anything.
    private String narrate(YearMonth ym, long days, int workers,
                           List<MonthReviewResponse.WorkerLine> mostPresent,
                           List<MonthReviewResponse.WorkerLine> late,
                           List<MonthReviewResponse.WorkerLine> absent,
                           List<MonthReviewResponse.WorkerLine> leave,
                           List<MonthReviewResponse.WorkerLine> unmarked) throws Exception {
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("days_in_period", days);
        metrics.put("workers_with_records", workers);
        metrics.put("best_attendance", mostPresent.stream()
                .map(l -> l.name() + " (" + l.attendancePct() + "%)").toList());
        metrics.put("persistently_late", late.stream().map(l -> l.name() + " — " + l.note()).toList());
        metrics.put("frequent_absence", absent.stream().map(l -> l.name() + " — " + l.note()).toList());
        metrics.put("frequent_leave", leave.stream().map(l -> l.name() + " — " + l.note()).toList());
        metrics.put("days_never_marked", unmarked.stream().map(l -> l.name() + " — " + l.note()).toList());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("metrics", metrics);
        body.put("language", "en");
        body.put("period_label", "Attendance for " + ym);

        HttpRequest req = HttpRequest.newBuilder(URI.create(aiBaseUrl + "/report"))
                .header("Content-Type", "application/json")
                    // 75s, ABOVE ai_service's own 60s total budget.
                    //
                    // ai_service splits that budget across the primary provider
                    // and the fallback, so a whole call is bounded at ~60s. This
                    // timeout is the backstop for the case where ai_service is
                    // wedged entirely -- it must NOT be the thing that fires
                    // first, which is what produced
                    // "HttpTimeoutException: request timed out" while the
                    // fallback was still running.
                .timeout(Duration.ofSeconds(75))
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() / 100 != 2) {
            // Include what the service actually said. FastAPI's 422 body names
            // the exact field it rejected; discarding it turned a one-line
            // diagnosis into guesswork.
            String detail = res.body() == null ? "" : res.body().strip();
            if (detail.length() > 300) {
                detail = detail.substring(0, 300) + "…";
            }
            throw new IllegalStateException("AI service returned HTTP " + res.statusCode()
                    + (detail.isEmpty() ? "" : ": " + detail));
        }
        String summary = mapper.readTree(res.body()).path("summary").asText("");
        if (summary.isBlank()) {
            throw new IllegalStateException("AI service returned an empty summary");
        }
        return summary;
    }
}
