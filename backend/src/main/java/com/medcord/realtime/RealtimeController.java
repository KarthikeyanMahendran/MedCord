package com.medcord.realtime;

import com.medcord.common.ApiException;
import com.medcord.community.Channel;
import com.medcord.community.ChannelRepository;
import com.medcord.message.ChannelAccess;
import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1")
public class RealtimeController {
    private final RealtimeHub hub;
    private final ChannelRepository channels;
    private final ChannelAccess access;
    private final UserRepository users;

    public RealtimeController(RealtimeHub hub, ChannelRepository channels, ChannelAccess access, UserRepository users) {
        this.hub = hub;
        this.channels = channels;
        this.access = access;
        this.users = users;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @GetMapping(value = "/realtime/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream(@AuthenticationPrincipal Jwt jwt) {
        return hub.connect(me(jwt));
    }

    @PostMapping("/channels/{channelId}/typing")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void typing(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId) {
        UUID userId = me(jwt);
        Channel ch = channels.findById(channelId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        access.permissions(ch, userId);
        if (ch.isArchived()) return;
        User u = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        hub.publishToChannel(channelId,
            RealtimeEvent.of("TYPING", channelId, ch.getCommunityId(),
                Map.of("userId", userId.toString(), "displayName", u.getDisplayName())),
            userId);
    }
}
