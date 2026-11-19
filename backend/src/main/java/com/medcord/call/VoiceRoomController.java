package com.medcord.call;

import com.medcord.call.VoiceRoomService.VoiceRoomDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class VoiceRoomController {
    private final VoiceRoomService service;

    public VoiceRoomController(VoiceRoomService service) {
        this.service = service;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    public record JoinRequest(Boolean micOn, Boolean camOn) {}
    public record StateRequest(Boolean micOn, Boolean camOn, Boolean screenSharing) {}
    public record SignalRequest(@NotNull UUID toUserId, @NotBlank String kind, @NotNull Object data) {}

    @GetMapping("/communities/{communityId}/voice-rooms")
    List<VoiceRoomDto> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID communityId) {
        return service.listForCommunity(communityId, me(jwt));
    }

    @GetMapping("/channels/{channelId}/voice")
    VoiceRoomDto get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId) {
        return service.getRoom(channelId, me(jwt));
    }

    @PostMapping("/channels/{channelId}/voice/join")
    VoiceRoomDto join(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId,
                      @RequestBody(required = false) JoinRequest r) {
        boolean mic = r == null || r.micOn() == null || r.micOn();
        boolean cam = r != null && Boolean.TRUE.equals(r.camOn());
        return service.join(channelId, me(jwt), mic, cam);
    }

    @PostMapping("/channels/{channelId}/voice/leave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void leave(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId) {
        service.leave(channelId, me(jwt));
    }

    @PatchMapping("/channels/{channelId}/voice/state")
    VoiceRoomDto updateState(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId,
                             @RequestBody StateRequest r) {
        return service.updateState(channelId, me(jwt), r.micOn(), r.camOn(), r.screenSharing());
    }

    @PostMapping("/channels/{channelId}/voice/signal")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void signal(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId,
                @Valid @RequestBody SignalRequest r) {
        service.signal(channelId, me(jwt), r.toUserId(), r.kind(), r.data());
    }
}
