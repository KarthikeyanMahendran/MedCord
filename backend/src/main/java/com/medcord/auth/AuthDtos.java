package com.medcord.auth;

import jakarta.validation.constraints.*;

public final class AuthDtos {
    private AuthDtos() {}

    public record RegisterRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(min = 10, max = 72, message = "must be 10-72 characters")
        @Pattern(regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$", message = "must contain upper, lower and a digit")
        String password,
        @NotBlank @Size(max = 100) String displayName,
        @NotBlank @Size(max = 100) String specialty,
        @NotBlank @Size(max = 64) String licenseNumber,
        @NotBlank @Pattern(regexp = "^[A-Za-z]{2}$", message = "must be ISO 3166 alpha-2") String licenseCountry) {}

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record TokenResponse(String accessToken, String refreshToken, String tokenType, long expiresIn) {}

    public record MeResponse(
        String id, String email, String displayName, String status, String platformRole,
        String specialty, String licenseCountry, String verificationStatus, String bio, String rejectionReason) {}

    public record UpdateProfileRequest(@Size(min = 1, max = 100) String displayName, @Size(max = 2000) String bio, @Size(min = 1, max = 100) String specialty) {}

    public record ResubmitRequest(
        @NotBlank @Size(max = 64) String licenseNumber,
        @NotBlank @Pattern(regexp = "^[A-Za-z]{2}$", message = "must be ISO 3166 alpha-2") String licenseCountry) {}
}
