package com.medcord.copilot;

import com.medcord.copilot.ClinicalSynthesizer.Mode;
import com.medcord.copilot.CopilotService.CopilotResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class CopilotController {
    private final CopilotService service;

    public CopilotController(CopilotService service) {
        this.service = service;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    public record CopilotRequest(@NotNull Mode mode, @Size(max = 1000) String prompt, UUID threadId) {}

    @PostMapping("/channels/{channelId}/copilot")
    @ResponseStatus(HttpStatus.CREATED)
    CopilotResponse invoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId,
                           @Valid @RequestBody CopilotRequest r) {
        return service.invoke(channelId, me(jwt), r.mode(), r.prompt(), r.threadId());
    }
}
