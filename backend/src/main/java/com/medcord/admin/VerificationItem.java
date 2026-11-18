package com.medcord.admin;

import com.medcord.user.ProfessionalProfile.Verification;
import java.time.Instant;
import java.util.UUID;

public record VerificationItem(
    UUID userId, String displayName, String email, String specialty, String licenseNumber,
    String licenseCountry, Verification status, Instant submittedAt, Instant verifiedAt) {}
