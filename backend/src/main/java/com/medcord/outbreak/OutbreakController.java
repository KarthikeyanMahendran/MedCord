package com.medcord.outbreak;

import com.medcord.outbreak.OutbreakDtos.*;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/outbreaks")
public class OutbreakController {
    private final OutbreakService service;
    private final OutbreakDemo demo;

    public OutbreakController(OutbreakService service, OutbreakDemo demo) { this.service = service; this.demo = demo; }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @GetMapping
    RadarDto radar(@AuthenticationPrincipal Jwt jwt) { return service.radar(me(jwt)); }

    @GetMapping("/{id}")
    AlertDetail detail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.detail(me(jwt), id); }

    @PostMapping("/{id}/acknowledge")
    AlertDto acknowledge(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody(required = false) NoteRequest r) {
        return service.acknowledge(me(jwt), id, r == null ? null : r.note());
    }

    @PostMapping("/{id}/resolve")
    AlertDto resolve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.resolve(me(jwt), id); }

    @PostMapping("/demo") @ResponseStatus(HttpStatus.CREATED)
    DemoResult runDemo(@AuthenticationPrincipal Jwt jwt) { return demo.run(me(jwt)); }

    @DeleteMapping("/demo")
    Map<String, Integer> resetDemo(@AuthenticationPrincipal Jwt jwt) { return Map.of("removed", demo.reset(me(jwt))); }
}
