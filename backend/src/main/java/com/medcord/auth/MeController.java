package com.medcord.auth;

import com.medcord.admin.VerificationDecision;
import com.medcord.admin.VerificationDecisionRepository;
import com.medcord.auth.AuthDtos.*;
import com.medcord.common.ApiException;
import com.medcord.user.*;
import com.medcord.user.ProfessionalProfile.Verification;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me")
public class MeController {
    private final UserRepository users;
    private final ProfessionalProfileRepository profiles;
    private final VerificationDecisionRepository decisions;

    public MeController(UserRepository users, ProfessionalProfileRepository profiles, VerificationDecisionRepository decisions) {
        this.users = users;
        this.profiles = profiles;
        this.decisions = decisions;
    }

    @GetMapping
    @Transactional(readOnly = true)
    MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return build(UUID.fromString(jwt.getSubject()));
    }

    @PatchMapping
    @Transactional
    MeResponse update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateProfileRequest r) {
        UUID id = UUID.fromString(jwt.getSubject());
        User u = user(id);
        ProfessionalProfile p = profiles.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Profile not found"));
        if (r.displayName() != null && !r.displayName().isBlank()) u.setDisplayName(r.displayName().trim());
        if (r.bio() != null) p.setBio(r.bio().isBlank() ? null : r.bio().trim());
        if (r.specialty() != null && !r.specialty().isBlank()) p.setSpecialty(r.specialty().trim());
        users.flush();
        profiles.flush();
        return build(id);
    }

    /** A rejected user may correct their licence details and go back into the review queue. */
    @PostMapping("/verification")
    @Transactional
    MeResponse resubmit(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ResubmitRequest r) {
        UUID id = UUID.fromString(jwt.getSubject());
        ProfessionalProfile p = profiles.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Profile not found"));
        if (p.getVerificationStatus() != Verification.REJECTED) {
            throw new ApiException(HttpStatus.CONFLICT, "Only rejected requests can be resubmitted");
        }
        String country = r.licenseCountry().toUpperCase();
        String number = r.licenseNumber().trim();
        boolean changed = !country.equals(p.getLicenseCountry()) || !number.equals(p.getLicenseNumber());
        if (changed && profiles.existsByLicenseCountryAndLicenseNumber(country, number)) {
            throw new ApiException(HttpStatus.CONFLICT, "License already registered");
        }
        p.setLicenseCountry(country);
        p.setLicenseNumber(number);
        p.setVerificationStatus(Verification.PENDING);
        p.setVerifiedAt(null);
        profiles.flush();
        return build(id);
    }

    private String rejectionReason(UUID id, ProfessionalProfile p) {
        if (p == null || p.getVerificationStatus() != Verification.REJECTED) return null;
        return decisions.findFirstByUserIdOrderByDecidedAtDesc(id).map(VerificationDecision::getReason).orElse(null);
    }

    private User user(UUID id) {
        return users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Unknown user"));
    }

    private MeResponse build(UUID id) {
        User u = user(id);
        ProfessionalProfile p = profiles.findById(id).orElse(null);
        return new MeResponse(id.toString(), u.getEmail(), u.getDisplayName(), u.getStatus().name(),
            u.getPlatformRole().name(), p == null ? null : p.getSpecialty(),
            p == null ? null : p.getLicenseCountry(),
            p == null ? null : p.getVerificationStatus().name(), p == null ? null : p.getBio(), rejectionReason(id, p),
            u.getAccountType(), u.getPreferredLanguage());
    }
}
