package com.chaghor.chaghor.config;

import jakarta.validation.ConstraintViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Turns Bean Validation failures into a clean 400 with per-field messages,
 * instead of leaking Spring's verbose default error body / stack trace.
 *
 * - MethodArgumentNotValidException  -> @Valid @RequestBody violations
 * - ConstraintViolationException     -> @Validated params / path variables
 * - ResponseStatusException          -> our own hand-written error sentences
 *
 * On that third one: every service in this codebase raises errors as
 * ResponseStatusException with a sentence an estate admin can read
 * ("Deductions can only be edited while a payslip is in Draft or Review.").
 * Without a handler here those fell through to Spring's default error body,
 * and because application.yaml sets `include-message: on_param` the reason was
 * stripped out of it. The frontend's apiError() then fell back to the `error`
 * field, which in that body is the literal string "Bad Request" -- so users saw
 * "Bad Request" for every one of those carefully worded messages.
 *
 * Returning {"error": "<the reason>"} restores them with no frontend change,
 * because apiError() already reads body.error. `include-message` stays
 * on_param, so framework exceptions we did not write are still not exposed.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleInvalidBody(MethodArgumentNotValidException ex) {
        Map<String, String> fields = new HashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fields.put(fe.getField(), fe.getDefaultMessage());
        }
        return ResponseEntity.badRequest().body(Map.of(
                "error", "Validation failed",
                "fields", fields));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConstraint(ConstraintViolationException ex) {
        Map<String, String> fields = ex.getConstraintViolations().stream()
                .collect(Collectors.toMap(
                        v -> v.getPropertyPath().toString(),
                        v -> v.getMessage(),
                        (a, b) -> a));
        return ResponseEntity.badRequest().body(Map.of(
                "error", "Validation failed",
                "fields", fields));
    }

    // Our own errors. The original status is preserved -- 404 stays 404, 409
    // stays 409 -- so nothing that depends on the status code changes; only the
    // body gains the sentence that was already written at the throw site.
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleStatus(ResponseStatusException ex) {
        String reason = ex.getReason();
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of(
                "error", (reason == null || reason.isBlank())
                        ? "The request could not be completed."
                        : reason));
    }
}
