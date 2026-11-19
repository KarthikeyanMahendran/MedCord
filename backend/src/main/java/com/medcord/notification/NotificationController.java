package com.medcord.notification;

import com.medcord.notification.NotificationDtos.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class NotificationController {
    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @PostMapping("/channels/{channelId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId,
                  @RequestBody(required = false) MarkReadRequest r) {
        service.markRead(me(jwt), channelId, r == null ? null : r.messageId());
    }

    @GetMapping("/me/unreads")
    List<ChannelUnreadDto> unreads(@AuthenticationPrincipal Jwt jwt) {
        return service.unreads(me(jwt));
    }

    @GetMapping("/me/mentions")
    List<MentionItemDto> mentions(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "50") int limit) {
        return service.listMentions(me(jwt), limit);
    }

    @GetMapping("/me/notification-prefs")
    NotificationPrefsDto getPrefs(@AuthenticationPrincipal Jwt jwt) {
        return service.getPrefs(me(jwt));
    }

    @PutMapping("/me/notification-prefs")
    NotificationPrefsDto updatePrefs(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateNotificationPrefsRequest r) {
        return service.updatePrefs(me(jwt), r);
    }

    @PutMapping("/me/notification-prefs/channels/{channelId}")
    NotificationPrefsDto setChannelLevel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId,
                                         @Valid @RequestBody ChannelLevelRequest r) {
        return service.setChannelLevel(me(jwt), channelId, r.level());
    }
}
