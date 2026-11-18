package com.medcord.cases;

import com.medcord.cases.CaseDtos.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class CaseController {
    private final CaseService service;

    public CaseController(CaseService service) { this.service = service; }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @PostMapping("/cases") @ResponseStatus(HttpStatus.CREATED)
    SubmitResult submit(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SubmitCaseRequest r) { return service.submit(me(jwt), r); }

    @GetMapping("/cases/mine")
    List<CaseDto> mine(@AuthenticationPrincipal Jwt jwt) { return service.mine(me(jwt)); }

    @GetMapping("/cases/queue")
    List<CaseDto> queue(@AuthenticationPrincipal Jwt jwt) { return service.queue(me(jwt)); }

    @GetMapping("/cases/{id}")
    CaseDto get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.get(me(jwt), id); }

    @PostMapping("/cases/{id}/accept")
    CaseDto accept(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.accept(me(jwt), id); }

    @PostMapping("/cases/{id}/answer")
    CaseDto answer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody AnswerRequest r) { return service.answer(me(jwt), id, r.answer()); }

    @PostMapping("/cases/{id}/followup")
    CaseDto followup(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody FollowupRequest r) { return service.followup(me(jwt), id, r); }

    @GetMapping("/library")
    List<LibraryHit> library(@RequestParam(required = false) String q) { return service.library(q); }

    @PostMapping("/library/{id}/helpful") @ResponseStatus(HttpStatus.NO_CONTENT)
    void helpful(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { service.markHelpful(me(jwt), id); }

    @GetMapping("/impact")
    ImpactDto impact() { return service.impact(); }

    @PutMapping("/doctors/me/availability") @ResponseStatus(HttpStatus.NO_CONTENT)
    void availability(@AuthenticationPrincipal Jwt jwt, @RequestBody AvailabilityRequest r) { service.setAvailability(me(jwt), r); }

    @GetMapping("/notifications")
    List<NotificationDto> notifications(@AuthenticationPrincipal Jwt jwt) { return service.notifications(me(jwt)); }

    @PostMapping("/notifications/{id}/read") @ResponseStatus(HttpStatus.NO_CONTENT)
    void read(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { service.markRead(me(jwt), id); }
}
