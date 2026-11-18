package com.medcord.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public class AiDtos {
    public record AiQueryRequest(
        @NotBlank @Size(min = 2, max = 1000) String question,
        UUID communityId,
        UUID channelId
    ) {}

    public record AiCitation(
        UUID messageId,
        UUID channelId,
        String channelName,
        UUID communityId,
        String communityName,
        UUID authorId,
        String authorName,
        Instant timestamp,
        String snippet
    ) {}

    public record AiQueryResponse(
        String answer,
        List<AiCitation> citations,
        boolean aiGenerated
    ) {}

    public record AiIngestResponse(
        int totalChunksCreated,
        int totalMessagesProcessed,
        String status
    ) {}
}
