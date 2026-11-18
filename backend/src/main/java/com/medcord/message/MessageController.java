package com.medcord.message;

import com.medcord.message.MessageDtos.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class MessageController {
    private final MessageService service;

    public MessageController(MessageService service) {
        this.service = service;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @PostMapping("/channels/{channelId}/messages") @ResponseStatus(HttpStatus.CREATED)
    MessageDto send(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId, @Valid @RequestBody SendRequest r) {
        return service.send(channelId, me(jwt), r);
    }

    @GetMapping("/channels/{channelId}/messages")
    MessagePage list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId,
                     @RequestParam(required = false) UUID before, @RequestParam(defaultValue = "50") int limit) {
        return service.list(channelId, me(jwt), before, limit);
    }

    @PatchMapping("/messages/{id}")
    MessageDto edit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody EditRequest r) {
        return service.edit(id, me(jwt), r.body());
    }

    @DeleteMapping("/messages/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { service.delete(id, me(jwt)); }

    @GetMapping("/messages/{id}/revisions")
    List<RevisionDto> history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.history(id, me(jwt)); }
}
