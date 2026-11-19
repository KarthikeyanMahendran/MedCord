package com.medcord.message;

import com.medcord.attachment.AttachmentService.AttachmentDto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class MessageDtos {
    private MessageDtos() {}

    public record SendRequest(@Size(max = 4000) String body, UUID replyToId, List<UUID> attachmentIds, Boolean autoRedact) {
        public SendRequest(String body, UUID replyToId) {
            this(body, replyToId, null, null);
        }

        public SendRequest(String body, UUID replyToId, List<UUID> attachmentIds) {
            this(body, replyToId, attachmentIds, null);
        }
    }

    public record EditRequest(@NotBlank @Size(max = 4000) String body, Boolean autoRedact) {
        public EditRequest(String body) {
            this(body, null);
        }
    }

    public record Author(UUID id, String displayName, String specialty, boolean verified) {}

    public record ReplyPreview(UUID id, String authorName, String excerpt, boolean deleted) {}

    public record ReactionDto(String emoji, long count, boolean mine) {}

    public record ThreadSummary(UUID id, String title, long replyCount, Instant lastReplyAt, boolean archived) {}

    /** body is null when deleted. thread is set on a root message that has a thread; threadId on a thread reply. */
    public record MessageDto(UUID id, UUID channelId, Author author, String body, Instant createdAt,
                             Instant editedAt, boolean deleted, ReplyPreview replyTo, ThreadSummary thread, UUID threadId,
                             List<ReactionDto> reactions, boolean pinned, String kind, UUID callId,
                             List<AttachmentDto> attachments, boolean bookmarked) {}

    public record CreateThreadRequest(@Size(max = 120) String title) {}

    public record UpdateThreadRequest(@Size(max = 120) String title, Boolean archived) {}

    public record ThreadDto(UUID id, UUID channelId, UUID rootMessageId, String title, boolean archived, long replyCount,
                            Instant lastReplyAt, UUID createdBy, Instant createdAt, MessageDto root) {}

    public record MessagePage(List<MessageDto> items, boolean hasMore) {}

    public record RevisionDto(int revisionNo, String kind, String body, UUID actorId, String actorName, Instant createdAt) {}

    public record BookmarkRequest(@Size(max = 500) String note) {}

    public record BookmarkDto(UUID messageId, UUID channelId, UUID communityId, String channelName,
                              String communityName, String note, Instant savedAt, MessageDto message) {}
}
