package com.medcord.auth;

import com.medcord.auth.AuthDtos.MeResponse;
import com.medcord.common.ApiException;
import com.medcord.user.*;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me")
public class MeController {
    private final UserRepository users;
    private final ProfessionalProfileRepository profiles;

    public MeController(UserRepository users, ProfessionalProfileRepository profiles) {
        this.users = users;
        this.profiles = profiles;
    }

    @GetMapping
    MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        UUID id = UUID.fromString(jwt.getSubject());
        User u = users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        ProfessionalProfile p = profiles.findById(id).orElse(null);
        return new MeResponse(id.toString(), u.getEmail(), u.getDisplayName(), u.getStatus().name(),
            u.getPlatformRole().name(), p == null ? null : p.getSpecialty(),
            p == null ? null : p.getLicenseCountry(), p == null ? null : p.getVerificationStatus().name());
    }
}
