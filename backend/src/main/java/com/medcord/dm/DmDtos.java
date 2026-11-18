package com.medcord.dm;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class DmDtos {
    private DmDtos() {}

    public record StartDmRequest(@NotEmpty @Size(max = 9) Set<UUID> userIds) {}

    public record Participant(UUID id, String displayName, String specialty, boolean verified, boolean online) {}

    public record LastMessage(String authorName, String excerpt, Instant at) {}

    /** id is the channel id: use it with the normal /channels/{id}/messages endpoints. */
    public record ConversationDto(UUID id, boolean group, String name, List<Participant> participants,
                                  LastMessage lastMessage, boolean blockedByMe, boolean blockedByThem) {}

    public record BlockedUser(UUID id, String displayName, Instant blockedAt) {}
}
