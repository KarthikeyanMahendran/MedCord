package com.medcord.support;

import com.medcord.support.SupportService.*;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class SupportController {
    private final SupportService service;

    public SupportController(SupportService service) { this.service = service; }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @GetMapping("/dispatch")
    List<Dispatch> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String scope) { return service.listDispatch(me(jwt), scope); }

    @PostMapping("/dispatch") @ResponseStatus(HttpStatus.CREATED)
    Dispatch create(@AuthenticationPrincipal Jwt jwt, @RequestBody DispatchRequest r) { return service.createDispatch(me(jwt), r); }

    @PostMapping("/dispatch/{id}/claim")
    Dispatch claim(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.claim(me(jwt), id); }

    @PostMapping("/dispatch/{id}/done")
    Dispatch done(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.finish(me(jwt), id); }

    @PostMapping("/dispatch/{id}/cancel")
    Dispatch cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.cancel(me(jwt), id); }

    @GetMapping("/checkins/mine")
    Mine mine(@AuthenticationPrincipal Jwt jwt) { return service.mine(me(jwt)); }

    @PostMapping("/checkins")
    Mine checkin(@AuthenticationPrincipal Jwt jwt, @RequestBody CheckinRequest r) { return service.checkin(me(jwt), r); }

    @GetMapping("/checkins/circle")
    List<CircleItem> circle(@AuthenticationPrincipal Jwt jwt) { return service.circle(me(jwt)); }

    @PostMapping("/checkins/{id}/cheer") @ResponseStatus(HttpStatus.NO_CONTENT)
    void cheer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { service.cheer(me(jwt), id); }
}
