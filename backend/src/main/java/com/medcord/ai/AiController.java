package com.medcord.ai;

import com.medcord.ai.AiDtos.*;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/ai")
public class AiController {
    private final AiKnowledgeService service;

    public AiController(AiKnowledgeService service) {
        this.service = service;
    }

    @PostMapping("/query")
    public AiQueryResponse query(
        @AuthenticationPrincipal Jwt jwt,
        @Valid @RequestBody AiQueryRequest request
    ) {
        UUID userId = UUID.fromString(jwt.getSubject());
        return service.query(userId, request.question(), request.communityId(), request.channelId());
    }

    @PostMapping("/ingest")
    public AiIngestResponse ingest(
        @AuthenticationPrincipal Jwt jwt,
        @RequestParam(required = false) UUID communityId
    ) {
        return service.ingestKnowledge(communityId);
    }
}
