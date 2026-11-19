package com.medcord.safety;

import com.medcord.safety.SafetyPolicy.PhiMode;
import com.medcord.safety.SafetyService.BlockedTermDto;
import com.medcord.safety.SafetyService.SafetyPolicyDto;
import com.medcord.safety.SafetyService.ScanResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class SafetyController {
    private final SafetyService service;

    public SafetyController(SafetyService service) {
        this.service = service;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    public record UpdatePolicyRequest(@NotNull PhiMode phiMode, boolean autoRedact) {}
    public record AddTermRequest(@NotBlank @Size(min = 2, max = 120) String term) {}
    public record ScanRequest(@Size(max = 4000) String body) {}

    @GetMapping("/communities/{id}/safety")
    SafetyPolicyDto getPolicy(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.getPolicy(id, me(jwt));
    }

    @PutMapping("/communities/{id}/safety")
    SafetyPolicyDto updatePolicy(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                 @Valid @RequestBody UpdatePolicyRequest r) {
        return service.updatePolicy(id, me(jwt), r.phiMode(), r.autoRedact());
    }

    @PostMapping("/communities/{id}/safety/terms")
    @ResponseStatus(HttpStatus.CREATED)
    BlockedTermDto addTerm(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                           @Valid @RequestBody AddTermRequest r) {
        return service.addTerm(id, me(jwt), r.term());
    }

    @DeleteMapping("/communities/{id}/safety/terms/{termId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeTerm(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID termId) {
        service.removeTerm(id, termId, me(jwt));
    }

    @PostMapping("/channels/{channelId}/phi-scan")
    ScanResponse scan(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId,
                      @Valid @RequestBody ScanRequest r) {
        return service.scanForChannel(channelId, me(jwt), r.body());
    }
}
