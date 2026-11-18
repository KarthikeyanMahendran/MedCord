package com.medcord.admin;

import com.medcord.user.ProfessionalProfile.Verification;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/** Platform-admin only (enforced in SecurityConfig for /api/v1/admin/**). */
@RestController
@RequestMapping("/api/v1/admin/verifications")
public class VerificationController {
    private final VerificationService service;

    public VerificationController(VerificationService service) {
        this.service = service;
    }

    public record PageResponse<T>(List<T> items, int page, int size, long total, int totalPages) {}

    public record DecisionRequest(@NotNull Verification decision, @Size(max = 1000) String reason) {}

    @GetMapping
    PageResponse<VerificationItem> list(@RequestParam(required = false) Verification status,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "20") int size) {
        Page<VerificationItem> p = service.list(status, page, size);
        return new PageResponse<>(p.getContent(), p.getNumber(), p.getSize(), p.getTotalElements(), p.getTotalPages());
    }

    @PatchMapping("/{userId}")
    VerificationItem decide(@PathVariable UUID userId, @Valid @RequestBody DecisionRequest r,
                            @AuthenticationPrincipal Jwt jwt) {
        return service.decide(userId, UUID.fromString(jwt.getSubject()), r.decision(), r.reason());
    }
}
