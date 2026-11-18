package com.medcord.audit;

import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/communities/{id}/audit")
public class AuditController {
    private final AuditService service;

    public AuditController(AuditService service) {
        this.service = service;
    }

    @GetMapping
    AuditService.AuditPage list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestParam(required = false) String action,
                                @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return service.list(id, UUID.fromString(jwt.getSubject()), action, page, size);
    }
}
