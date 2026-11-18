package com.medcord.ai;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class SarvamAiClient {
    private static final Logger log = LoggerFactory.getLogger(SarvamAiClient.class);
    private final AiProperties props;
    private final HttpClient http;
    private final JsonMapper json = JsonMapper.builder().build();

    public SarvamAiClient(AiProperties props) {
        this.props = props;
        this.http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
        log.info("SarvamAiClient initialized: configured={}, keyLength={}, baseUrl={}",
            isConfigured(), props.getSarvamApiKey() != null ? props.getSarvamApiKey().length() : 0, props.getSarvamBaseUrl());
    }

    public boolean isConfigured() {
        return props.getSarvamApiKey() != null && !props.getSarvamApiKey().isBlank();
    }

    public Optional<List<Double>> getEmbedding(String text) {
        if (!isConfigured() || text == null || text.isBlank()) {
            return Optional.empty();
        }
        try {
            String sanitized = text.length() > 2000 ? text.substring(0, 2000) : text;
            Map<String, Object> body = Map.of(
                "model", props.getEmbeddingModel(),
                "input", List.of(sanitized)
            );
            String payload = json.writeValueAsString(body);
            String url = props.getSarvamBaseUrl() + "/embeddings";

            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .header("api-subscription-key", props.getSarvamApiKey())
                .header("Authorization", "Bearer " + props.getSarvamApiKey())
                .timeout(Duration.ofSeconds(12))
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();

            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                JsonNode root = json.readTree(res.body());
                JsonNode data = root.get("data");
                if (data != null && data.isArray() && !data.isEmpty()) {
                    JsonNode embNode = data.get(0).get("embedding");
                    if (embNode != null && embNode.isArray()) {
                        List<Double> vector = new ArrayList<>();
                        for (JsonNode n : embNode) {
                            vector.add(n.asDouble());
                        }
                        return Optional.of(vector);
                    }
                }
            } else {
                log.warn("Sarvam embeddings returned code {}: {}", res.statusCode(), res.body());
            }
        } catch (Exception e) {
            log.warn("Failed to generate embedding with Sarvam AI: {}", e.getMessage());
        }
        return Optional.empty();
    }

    public Optional<String> completeChat(String systemPrompt, String userMessage) {
        if (!isConfigured()) {
            log.warn("Sarvam completeChat skipped: client is not configured (key length is {})",
                props.getSarvamApiKey() != null ? props.getSarvamApiKey().length() : 0);
            return Optional.empty();
        }
        try {
            Map<String, Object> body = Map.of(
                "model", props.getChatModel(),
                "messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userMessage)
                ),
                "temperature", 0.3,
                "max_tokens", 2500
            );
            String payload = json.writeValueAsString(body);
            String url = props.getSarvamBaseUrl() + "/chat/completions";

            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .header("api-subscription-key", props.getSarvamApiKey())
                .header("Authorization", "Bearer " + props.getSarvamApiKey())
                .timeout(Duration.ofSeconds(20))
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();

            log.info("Sending request to Sarvam chat: url={}, keyPrefix={}", url, props.getSarvamApiKey().substring(0, 5));
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            log.info("Sarvam chat returned status: {}, body: {}", res.statusCode(), res.body());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                JsonNode root = json.readTree(res.body());
                JsonNode choices = root.get("choices");
                if (choices != null && choices.isArray() && !choices.isEmpty()) {
                    JsonNode msg = choices.get(0).get("message");
                    if (msg != null && msg.has("content")) {
                        return Optional.of(msg.get("content").asText());
                    }
                }
            } else {
                log.warn("Sarvam chat completion returned code {}: {}", res.statusCode(), res.body());
            }
        } catch (Exception e) {
            log.warn("Failed to call Sarvam chat completion: {}", e.getMessage());
        }
        return Optional.empty();
    }

    public static double cosineSimilarity(List<Double> v1, List<Double> v2) {
        if (v1 == null || v2 == null || v1.isEmpty() || v2.isEmpty() || v1.size() != v2.size()) {
            return 0.0;
        }
        double dot = 0.0;
        double normA = 0.0;
        double normB = 0.0;
        for (int i = 0; i < v1.size(); i++) {
            double a = v1.get(i);
            double b = v2.get(i);
            dot += a * b;
            normA += a * a;
            normB += b * b;
        }
        if (normA == 0.0 || normB == 0.0) return 0.0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
