package com.medcord.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("medcord.security")
public record AuthProperties(String jwtSecret, long accessTtlMinutes, long refreshTtlDays) {
    public AuthProperties {
        if (jwtSecret == null || jwtSecret.getBytes().length < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes");
        }
    }
}
