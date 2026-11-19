package com.medcord.message;

import com.medcord.common.ApiException;
import com.medcord.community.*;
import com.medcord.message.MessageDtos.MessageDto;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reactions and pins. Both are metadata on a message and respect channel state (archived = read-only). */
@Service
public class ReactionService {
    private static final int MAX_EMOJIS_PER_MESSAGE = 20;
    private static final int MAX_PINS_PER_CHANNEL = 50;

    private final MessageRepository messages;
    private final ReactionRepository reactions;
    private final ChannelRepository channels;
    private final ChannelAccess access;
    private final MessageService messageService;
    private final com.medcord.audit.AuditService audit;
    private final com.medcord.realtime.RealtimeHub realtime;

    public ReactionService(MessageRepository messages, ReactionRepository reactions, ChannelRepository channels,
                           ChannelAccess access, MessageService messageService, com.medcord.audit.AuditService audit,
                           com.medcord.realtime.RealtimeHub realtime) {
        this.audit = audit;
        this.realtime = realtime;
        this.messages = messages; this.reactions = reactions; this.channels = channels;
        this.access = access; this.messageService = messageService;
    }

    @Transactional
    public MessageDto react(UUID messageId, UUID userId, String emoji) {
        validate(emoji);
        Message m = writable(messageId, userId);
        Reaction.Key key = new Reaction.Key(messageId, userId, emoji);
        if (!reactions.existsById(key)) {
            if (!reactions.existsByMessageIdAndEmoji(messageId, emoji) && reactions.distinctEmojis(messageId) >= MAX_EMOJIS_PER_MESSAGE) {
                throw new ApiException(HttpStatus.CONFLICT, "Too many different reactions on this message");
            }
            Reaction r = new Reaction();
            r.setMessageId(messageId);
            r.setUserId(userId);
            r.setEmoji(emoji);
            reactions.saveAndFlush(r);
        }
        realtime.publishToChannel(m.getChannelId(), com.medcord.realtime.RealtimeEvent.of("MESSAGE_UPDATED", m.getChannelId(), null, java.util.Map.of("messageId", m.getId())));
        return messageService.dto(m, userId);
    }

    @Transactional
    public MessageDto unreact(UUID messageId, UUID userId, String emoji) {
        validate(emoji);
        Message m = writable(messageId, userId);
        reactions.deleteById(new Reaction.Key(messageId, userId, emoji));
        reactions.flush();
        realtime.publishToChannel(m.getChannelId(), com.medcord.realtime.RealtimeEvent.of("MESSAGE_UPDATED", m.getChannelId(), null, java.util.Map.of("messageId", m.getId())));
        return messageService.dto(m, userId);
    }

    @Transactional
    public MessageDto pin(UUID messageId, UUID userId, boolean pin) {
        Message m = messages.findById(messageId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Message not found"));
        Channel ch = channel(m.getChannelId());
        if (ch.getType() == Channel.Type.DM) {
            access.assertCanPost(ch, userId);
        } else {
            access.require(ch, userId, Permission.MODERATE_MESSAGES);
        }
        if (m.isDeleted()) throw new ApiException(HttpStatus.CONFLICT, "Message was deleted");
        if (m.getThreadId() != null) throw new ApiException(HttpStatus.BAD_REQUEST, "Thread replies cannot be pinned");
        if (pin && m.getPinnedAt() == null) {
            if (messages.countPinned(ch.getId()) >= MAX_PINS_PER_CHANNEL) throw new ApiException(HttpStatus.CONFLICT, "Pin limit reached for this channel");
            m.setPinnedAt(java.time.Instant.now());
            m.setPinnedBy(userId);
        } else if (!pin) {
            m.setPinnedAt(null);
            m.setPinnedBy(null);
        }
        messages.saveAndFlush(m);
        audit.record(ch.getCommunityId(), userId, pin ? "MESSAGE_PINNED" : "MESSAGE_UNPINNED", "MESSAGE", m.getId(), (pin ? "Pinned" : "Unpinned") + " a message in #" + ch.getName());
        realtime.publishToChannel(ch.getId(), com.medcord.realtime.RealtimeEvent.of("MESSAGE_UPDATED", ch.getId(), ch.getCommunityId(), java.util.Map.of("messageId", m.getId())));
        return messageService.dto(m, userId);
    }

    @Transactional(readOnly = true)
    public List<MessageDto> pinned(UUID channelId, UUID userId) {
        Channel ch = channel(channelId);
        access.permissions(ch, userId);
        return messageService.toDtos(messages.pinned(channelId), userId);
    }

    private Message writable(UUID messageId, UUID userId) {
        Message m = messages.findById(messageId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Message not found"));
        Channel ch = channel(m.getChannelId());
        access.permissions(ch, userId);
        if (m.isDeleted()) throw new ApiException(HttpStatus.CONFLICT, "Message was deleted");
        if (ch.isArchived()) throw new ApiException(HttpStatus.CONFLICT, "This channel is archived and read-only");
        return m;
    }

    private static void validate(String emoji) {
        if (emoji == null || emoji.isBlank() || emoji.length() > 32 || emoji.codePoints().anyMatch(Character::isWhitespace)
            || emoji.codePoints().anyMatch(c -> Character.isLetterOrDigit(c) && c < 128)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid emoji");
        }
    }

    private Channel channel(UUID id) {
        return channels.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
    }
}
