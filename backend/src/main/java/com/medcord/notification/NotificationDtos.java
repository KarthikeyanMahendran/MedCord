package com.medcord.notification;

import com.medcord.notification.ChannelNotificationPref.Level;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public final class NotificationDtos {
    private NotificationDtos() {}

    public record MarkReadRequest(UUID messageId) {}

    public record ChannelUnreadDto(UUID channelId, UUID communityId, long unreadCount, long mentionCount, UUID lastReadMessageId) {}

    public record MentionItemDto(UUID id, UUID messageId, UUID channelId, UUID communityId, String channelName,
                                 String communityName, String authorName, String excerpt, String mentionKind,
                                 String label, Instant createdAt, boolean unread) {}

    public record NotificationPrefsDto(boolean dndEnabled, String dndStart, String dndEnd, boolean showToasts,
                                       boolean dndActiveNow, Map<UUID, Level> channelLevels) {}

    public record UpdateNotificationPrefsRequest(
        Boolean dndEnabled,
        @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$", message = "Use HH:MM 24-hour format") String dndStart,
        @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$", message = "Use HH:MM 24-hour format") String dndEnd,
        Boolean showToasts
    ) {}

    public record ChannelLevelRequest(@NotNull Level level) {}
}
