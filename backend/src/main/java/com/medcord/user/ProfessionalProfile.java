package com.medcord.user;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "professional_profiles")
@Getter
@Setter
public class ProfessionalProfile {
    public enum Verification { PENDING, APPROVED, REJECTED }

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    private String specialty;

    @Column(name = "license_number", nullable = false)
    private String licenseNumber;

    @Column(name = "license_country", nullable = false)
    private String licenseCountry;

    @Enumerated(EnumType.STRING)
    @Column(name = "verification_status", nullable = false)
    private Verification verificationStatus = Verification.PENDING;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    private String bio;

    @Column(name = "avatar_url")
    private String avatarUrl;
}
