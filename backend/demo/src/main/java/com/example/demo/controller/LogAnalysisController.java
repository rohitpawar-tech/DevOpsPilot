
package com.example.demo.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Locale;

@RestController
@RequestMapping("/api/logs")
@CrossOrigin(origins = {
        "http://localhost:5173",
        "http://127.0.0.1:5173"
})
public class LogAnalysisController {

    public record AnalyzeRequest(String log) {}

    public record AnalysisResponse(
            boolean success,
            String severity,
            String category,
            String probableCause,
            String suggestedFix,
            String matchedPattern,
            String originalLog,
            String analyzedAt
    ) {}

    @PostMapping("/analyze")
    public ResponseEntity<AnalysisResponse> analyze(
            @RequestBody(required = false) AnalyzeRequest request) {

        if (request == null || request.log() == null
                || request.log().isBlank()) {

            return ResponseEntity.badRequest().body(
                    new AnalysisResponse(
                            false,
                            "LOW",
                            "INVALID_INPUT",
                            "No log message was provided.",
                            "Paste an error log and try again.",
                            "Empty input",
                            "",
                            LocalDateTime.now().toString()
                    )
            );
        }

        String log = request.log().trim();
        String message = log.toLowerCase(Locale.ROOT);

        AnalysisResponse result;

        if (containsAny(message,
                "modulenotfounderror",
                "no module named",
                "classnotfoundexception",
                "noclassdeffounderror")) {

            result = response(
                    "HIGH", "DEPENDENCY_ERROR",
                    "A required module, library, or class may be missing.",
                    "Check the dependency name and version. Install the missing package or add the required library to the project.",
                    "Missing module or class", log
            );

        } else if (containsAny(message,
                "permission denied",
                "accessdeniedexception",
                "access is denied")) {

            result = response(
                    "HIGH", "PERMISSION_ERROR",
                    "The process may not have permission to access a file, folder, or resource.",
                    "Verify the file path and account permissions. Grant only the minimum permissions required; avoid running everything as administrator.",
                    "Permission denied", log
            );

        } else if (containsAny(message,
                "connection refused",
                "connectexception",
                "actively refused")) {

            result = response(
                    "HIGH", "CONNECTION_ERROR",
                    "The target service may be stopped, or the host and port may be incorrect.",
                    "Check whether the target service is running, verify its host and port, and inspect firewall or container networking settings.",
                    "Connection refused", log
            );

        } else if (containsAny(message,
                "outofmemoryerror",
                "java heap space",
                "out of memory")) {

            result = response(
                    "CRITICAL", "RESOURCE_ERROR",
                    "The application may have exhausted available memory.",
                    "Inspect memory usage and heap dumps, look for memory leaks, and review workload size before adjusting memory limits.",
                    "Out of memory", log
            );

        } else if (containsAny(message,
                "timed out",
                "timeout",
                "timeoutexception")) {

            result = response(
                    "MEDIUM", "TIMEOUT_ERROR",
                    "A request or operation took longer than its configured time limit.",
                    "Check service latency, network connectivity, downstream dependencies, and timeout settings. Increase timeouts only when justified.",
                    "Timeout detected", log
            );

        } else if (containsAny(message,
                "sqlsyntaxerrorexception",
                "communications link failure",
                "could not connect to server",
                "database connection")) {

            result = response(
                    "HIGH", "DATABASE_ERROR",
                    "A database connection or SQL operation may have failed.",
                    "Verify database availability, connection settings, credentials, and SQL syntax. Do not expose passwords in logs.",
                    "Database-related error", log
            );

        } else if (containsAny(message,
                "401 unauthorized",
                "unauthorized",
                "403 forbidden",
                "access forbidden")) {

            result = response(
                    "MEDIUM", "AUTHORIZATION_ERROR",
                    "Authentication or authorization may have failed.",
                    "Verify the login token or credentials, token expiry, and the user's access permissions. Never paste secrets into shared logs.",
                    "Authentication or authorization message", log
            );

        } else if (containsAny(message,
                "nullpointerexception",
                "cannot read properties of undefined",
                "attributeerror",
                "typeerror")) {

            result = response(
                    "MEDIUM", "APPLICATION_ERROR",
                    "The application may be accessing a null or unexpected value.",
                    "Inspect the stack trace and the failing line. Validate inputs and check whether the object or value exists before using it.",
                    "Null or type-related error", log
            );

        } else if (containsAny(message,
                "exception",
                "traceback",
                " error",
                "failed",
                "failure")) {

            result = response(
                    "MEDIUM", "GENERAL_ERROR",
                    "The log contains a general error or failure message.",
                    "Inspect the stack trace and the log lines immediately before the failure. Verify configuration, inputs, and recent code changes.",
                    "General error pattern", log
            );

        } else {
            result = response(
                    "INFO", "NO_KNOWN_PATTERN",
                    "No supported error pattern was detected in the supplied log.",
                    "Review the complete log, timestamps, surrounding events, and application configuration. Add a specific rule if this error is recurring.",
                    "No known pattern", log
            );
        }

        return ResponseEntity.ok(result);
    }

    private static boolean containsAny(
            String message, String... patterns) {

        for (String pattern : patterns) {
            if (message.contains(pattern)) {
                return true;
            }
        }

        return false;
    }

    private static AnalysisResponse response(
            String severity,
            String category,
            String probableCause,
            String suggestedFix,
            String matchedPattern,
            String originalLog) {

        return new AnalysisResponse(
                true,
                severity,
                category,
                probableCause,
                suggestedFix,
                matchedPattern,
                originalLog,
                LocalDateTime.now().toString()
        );
    }
}
