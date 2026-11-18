package com.medcord.moderation;

import com.medcord.moderation.MessageReport.Reason;
import com.medcord.moderation.MessageReport.Status;
import com.medcord.moderation.ModerationService.MuteDto;
import com.medcord.moderation.ModerationService.ReportDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ModerationController {
    private final ModerationService service;

    public ModerationController(ModerationService service) {
        this.service = service;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    public record MuteRequest(@Min(1) @Max(43200) int minutes, @Size(max = 500) String reason) {}
    public record ReportRequest(@NotNull Reason reason, @Size(max = 1000) String details) {}
    public record ResolveRequest(@NotNull Status status, Boolean deleteMessage) {}

    @PutMapping("/communities/{id}/members/{userId}/mute")
    MuteDto mute(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId, @Valid @RequestBody MuteRequest r) {
        return service.mute(id, me(jwt), userId, r.minutes(), r.reason());
    }

    @DeleteMapping("/communities/{id}/members/{userId}/mute") @ResponseStatus(HttpStatus.NO_CONTENT)
    void unmute(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId) { service.unmute(id, me(jwt), userId); }

    @GetMapping("/communities/{id}/mutes")
    List<MuteDto> mutes(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.activeMutes(id, me(jwt)); }

    @PostMapping("/messages/{id}/report") @ResponseStatus(HttpStatus.CREATED)
    void report(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ReportRequest r) { service.report(id, me(jwt), r.reason(), r.details()); }

    @GetMapping("/communities/{id}/reports")
    List<ReportDto> reports(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestParam(required = false) Status status) { return service.queue(id, me(jwt), status); }

    @PatchMapping("/communities/{id}/reports/{reportId}")
    ReportDto resolve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID reportId, @Valid @RequestBody ResolveRequest r) {
        return service.resolve(id, reportId, me(jwt), r.status(), Boolean.TRUE.equals(r.deleteMessage()));
    }
}
