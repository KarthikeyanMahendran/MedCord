package com.medcord.fundraiser;

import com.medcord.fundraiser.FundraiserService.*;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/fundraisers")
public class FundraiserController {
    private final FundraiserService service;

    public FundraiserController(FundraiserService service) { this.service = service; }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @GetMapping
    List<Card> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID communityId, @RequestParam(required = false) String scope) {
        return service.list(me(jwt), communityId, scope);
    }

    @GetMapping("/summary")
    Summary summary(@AuthenticationPrincipal Jwt jwt) { return service.summary(me(jwt)); }

    @GetMapping("/{id}")
    Detail detail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.detail(me(jwt), id); }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    Card create(@AuthenticationPrincipal Jwt jwt, @RequestBody CreateRequest r) { return service.create(me(jwt), r); }

    @PostMapping("/{id}/verify")
    Card verify(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.verify(me(jwt), id); }

    @PostMapping("/{id}/reject")
    Card reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody ReasonRequest r) { return service.reject(me(jwt), id, r.reason()); }

    @PostMapping("/{id}/contribute")
    Detail contribute(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody ContributeRequest r) { return service.contribute(me(jwt), id, r); }

    @PostMapping("/{id}/updates")
    Detail update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @RequestBody UpdateRequest r) { return service.postUpdate(me(jwt), id, r); }

    @PostMapping("/{id}/close")
    Card close(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.close(me(jwt), id); }
}
