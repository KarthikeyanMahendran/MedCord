package com.medcord.message;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class MessageDtos {
    private MessageDtos() {}

    public record SendRequest(@NotBlank @Size(max = 4000) String body, UUID replyToId) {}

    public record EditRequest(@NotBlank @Size(max = 4000) String body) {}

    public record Author(UUID id, String displayName, String specialty, boolean verified) {}

    public record ReplyPreview(UUID id, String authorName, String excerpt, boolean deleted) {}

    /** body is null when deleted. */
    public record MessageDto(UUID id, UUID channelId, Author author, String body, Instant createdAt,
                             Instant editedAt, boolean deleted, ReplyPreview replyTo) {}

    public record MessagePage(List<MessageDto> items, boolean hasMore) {}

    public record RevisionDto(int revisionNo, String kind, String body, UUID actorId, String actorName, Instant createdAt) {}
}
