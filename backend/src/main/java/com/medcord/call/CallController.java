package com.medcord.call;

import com.medcord.call.CallService.CallDto;
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
@RequestMapping("/api/v1/calls")
public class CallController {
    private final CallService service;

    public CallController(CallService service) {
        this.service = service;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    public record StartRequest(@NotNull UUID channelId, @NotNull Call.Media media) {}
    public record AttachRequest(@NotBlank @Size(max = 128) String providerCallId) {}
    public record EndRequest(@NotNull Call.Status outcome) {}

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    CallDto start(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody StartRequest r) { return service.start(me(jwt), r.channelId(), r.media()); }

    @GetMapping("/{id}")
    CallDto get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.get(id, me(jwt)); }

    @PostMapping("/{id}/attach")
    CallDto attach(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody AttachRequest r) { return service.attach(id, me(jwt), r.providerCallId()); }

    @PostMapping("/{id}/connected")
    CallDto connected(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.connected(id, me(jwt)); }

    @PostMapping("/{id}/end")
    CallDto end(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody EndRequest r) { return service.end(id, me(jwt), r.outcome()); }
}
