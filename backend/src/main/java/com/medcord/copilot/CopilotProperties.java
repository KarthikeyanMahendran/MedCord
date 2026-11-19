package com.medcord.copilot;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("medcord.copilot")
public record CopilotProperties(String apiUrl, String apiKey, String model, long chunkDelayMs) {
    public CopilotProperties {
        if (model == null || model.isBlank()) model = "gemini-2.5-flash";
        if (chunkDelayMs < 0) chunkDelayMs = 0;
    }

    public boolean externalLlmConfigured() {
        return apiUrl != null && !apiUrl.isBlank() && apiKey != null && !apiKey.isBlank();
    }
}
