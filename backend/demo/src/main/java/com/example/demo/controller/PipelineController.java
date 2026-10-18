
package com.example.demo.controller;

import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "http://localhost:5173")
public class PipelineController {

    private final AtomicLong idGenerator = new AtomicLong(3);

    private final List<Map<String, Object>> pipelines =
            new CopyOnWriteArrayList<>(List.of(
                    createPipeline(1, "Frontend Build", "SUCCESS", "main"),
                    createPipeline(2, "Backend Tests", "RUNNING", "develop"),
                    createPipeline(3, "Docker Deployment", "FAILED", "release")
            ));

    private static Map<String, Object> createPipeline(
            long id, String name, String status, String branch) {

        Map<String, Object> pipeline = new LinkedHashMap<>();
        pipeline.put("id", id);
        pipeline.put("name", name);
        pipeline.put("status", status);
        pipeline.put("branch", branch);
        pipeline.put("createdAt", new Date().toString());
        return pipeline;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "application", "DevOpsPilot",
                "status", "UP",
                "message", "Backend is running successfully"
        );
    }

    @GetMapping("/pipelines")
    public List<Map<String, Object>> getPipelines() {
        return pipelines;
    }

    @PostMapping("/pipelines")
    public Map<String, Object> createNewPipeline(
            @RequestBody Map<String, String> request) {

        String name = request.get("name");
        String branch = request.getOrDefault("branch", "main");

        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Pipeline name is required");
        }

        Map<String, Object> pipeline = createPipeline(
                idGenerator.incrementAndGet(),
                name.trim(),
                "QUEUED",
                branch
        );

        pipelines.add(pipeline);
        return pipeline;
    }

    @GetMapping("/stats")
    public Map<String, Long> getStats() {
        long total = pipelines.size();
        long success = countByStatus("SUCCESS");
        long failed = countByStatus("FAILED");
        long running = countByStatus("RUNNING");

        return Map.of(
                "totalPipelines", total,
                "successful", success,
                "failed", failed,
                "running", running,
                "queued", countByStatus("QUEUED")
        );
    }

    private long countByStatus(String status) {
        return pipelines.stream()
                .filter(p -> status.equals(p.get("status")))
                .count();
    }
}
