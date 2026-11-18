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
    private final ThreadService threads;
    private final ReactionService reactions;

    public MessageController(MessageService service, ThreadService threads, ReactionService reactions) {
        this.service = service;
        this.threads = threads;
        this.reactions = reactions;
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

    // threads
    @PostMapping("/messages/{id}/thread")
    ThreadDto startThread(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody(required = false) CreateThreadRequest r) {
        return threads.start(id, me(jwt), r == null ? null : r.title());
    }

    @GetMapping("/threads/{id}")
    ThreadDto thread(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return threads.get(id, me(jwt)); }

    @PatchMapping("/threads/{id}")
    ThreadDto updateThread(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody UpdateThreadRequest r) { return threads.update(id, me(jwt), r); }

    @GetMapping("/threads/{id}/messages")
    MessagePage threadMessages(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                               @RequestParam(required = false) UUID before, @RequestParam(defaultValue = "50") int limit) {
        return threads.replies(id, me(jwt), before, limit);
    }

    @PostMapping("/threads/{id}/messages") @ResponseStatus(HttpStatus.CREATED)
    MessageDto replyInThread(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody SendRequest r) {
        return threads.reply(id, me(jwt), r);
    }

    // reactions and pins
    @PutMapping("/messages/{id}/reactions/{emoji}")
    MessageDto react(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable String emoji) { return reactions.react(id, me(jwt), emoji); }

    @DeleteMapping("/messages/{id}/reactions/{emoji}")
    MessageDto unreact(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable String emoji) { return reactions.unreact(id, me(jwt), emoji); }

    @PutMapping("/messages/{id}/pin")
    MessageDto pin(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return reactions.pin(id, me(jwt), true); }

    @DeleteMapping("/messages/{id}/pin")
    MessageDto unpin(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return reactions.pin(id, me(jwt), false); }

    @GetMapping("/channels/{channelId}/pins")
    List<MessageDto> pins(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId) { return reactions.pinned(channelId, me(jwt)); }
}
