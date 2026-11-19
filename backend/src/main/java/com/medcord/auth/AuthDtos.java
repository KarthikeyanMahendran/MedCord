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
        /** DOCTOR (default, for older clients) or HEALTH_WORKER. */
        @Pattern(regexp = "^(DOCTOR|HEALTH_WORKER)$", message = "must be DOCTOR or HEALTH_WORKER") String accountType,
        // Doctors only: the service requires these when accountType is DOCTOR.
        @Size(max = 100) String specialty,
        @Size(max = 64) String licenseNumber,
        @Pattern(regexp = "^$|^[A-Za-z]{2}$", message = "must be ISO 3166 alpha-2") String licenseCountry,
        // Health workers only.
        java.util.UUID regionId,
        @Pattern(regexp = "^$|^[a-z]{2,3}$", message = "must be a language code such as en or ta") String preferredLanguage,
        @Size(max = 160) String organisation,
        /** Health workers: ASHA or CHW (any other community or healthcare worker). */
        @Pattern(regexp = "^(ASHA|CHW)$", message = "must be ASHA or CHW") String workerType) {}

    /**
     * Everything after the password is optional so older clients keep working. When accountType is given the server
     * checks it against the account. A doctor also gives speciality and licence number. An ASHA worker gives the
     * ASHA / NHM ID (in licenseNumber) and workerType ASHA.
     */
    public record LoginRequest(
        @NotBlank String email, @NotBlank String password,
        @Pattern(regexp = "^(DOCTOR|HEALTH_WORKER|ADMIN)$", message = "must be DOCTOR, HEALTH_WORKER or ADMIN") String accountType,
        @Pattern(regexp = "^(ASHA|CHW)$", message = "must be ASHA or CHW") String workerType,
        @Size(max = 100) String specialty,
        @Size(max = 64) String licenseNumber) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record TokenResponse(String accessToken, String refreshToken, String tokenType, long expiresIn) {}

    public record MeResponse(
        String id, String email, String displayName, String status, String platformRole,
        String specialty, String licenseCountry, String verificationStatus, String bio, String rejectionReason,
        String accountType, String preferredLanguage) {}

    public record RegionOption(java.util.UUID id, String name, String district, String state) {}

    public record UpdateProfileRequest(@Size(min = 1, max = 100) String displayName, @Size(max = 2000) String bio, @Size(min = 1, max = 100) String specialty) {}

    public record ResubmitRequest(
        @NotBlank @Size(max = 64) String licenseNumber,
        @NotBlank @Pattern(regexp = "^[A-Za-z]{2}$", message = "must be ISO 3166 alpha-2") String licenseCountry) {}
}
