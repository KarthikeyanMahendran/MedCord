package com.medcord.dm;

import com.medcord.dm.DmDtos.*;
import com.medcord.user.UserRepository;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class DmController {
    private final DmService service;
    private final UserRepository users;

    public DmController(DmService service, UserRepository users) {
        this.service = service;
        this.users = users;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @PostMapping("/dms")
    ConversationDto start(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody StartDmRequest r) { return service.start(me(jwt), r.userIds()); }

    @GetMapping("/dms")
    List<ConversationDto> list(@AuthenticationPrincipal Jwt jwt,
                               @RequestParam(defaultValue = "50") int limit,
                               @RequestParam(defaultValue = "0") int offset) {
        return service.list(me(jwt), limit, offset);
    }

    @GetMapping("/dms/{channelId}")
    ConversationDto get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId) { return service.get(channelId, me(jwt)); }

    @GetMapping("/users/blocks")
    List<BlockedUser> blocked(@AuthenticationPrincipal Jwt jwt) { return service.blocked(me(jwt)); }

    @PutMapping("/users/{id}/block") @ResponseStatus(HttpStatus.NO_CONTENT)
    void block(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { service.block(me(jwt), id); }

    @DeleteMapping("/users/{id}/block") @ResponseStatus(HttpStatus.NO_CONTENT)
    void unblock(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { service.unblock(me(jwt), id); }

    /** Clients call this every ~30s while the app is visible. */
    @PostMapping("/presence/heartbeat") @ResponseStatus(HttpStatus.NO_CONTENT)
    void heartbeat(@AuthenticationPrincipal Jwt jwt) { users.touch(me(jwt), Instant.now()); }
}
