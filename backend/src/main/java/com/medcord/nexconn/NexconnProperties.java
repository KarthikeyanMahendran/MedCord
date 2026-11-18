package com.medcord.nexconn;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** apiBaseUrl is a full base such as https://api.sg-light-api.com (region-specific; see docs/nexconn-notes.md). */
@ConfigurationProperties("medcord.nexconn")
public record NexconnProperties(String appKey, String appSecret, String apiBaseUrl) {
    public boolean configured() {
        return notBlank(appKey) && notBlank(appSecret) && notBlank(apiBaseUrl);
    }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }
}
