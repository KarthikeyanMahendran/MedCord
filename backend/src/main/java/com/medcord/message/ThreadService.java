package com.medcord.message;

import com.medcord.common.ApiException;
import com.medcord.community.*;
import com.medcord.message.MessageDtos.*;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ThreadService {
    private final ThreadRepository threads;
    private final MessageRepository messages;
    private final ChannelRepository channels;
    private final MessageService messageService;
    private final ChannelAccess access;

    public ThreadService(ThreadRepository threads, MessageRepository messages, ChannelRepository channels,
                         MessageService messageService, ChannelAccess access) {
        this.threads = threads; this.messages = messages; this.channels = channels;
        this.messageService = messageService; this.access = access;
    }

    /** Idempotent: starting a thread on a message that already has one returns the existing thread. */
    @Transactional
    public ThreadDto start(UUID messageId, UUID userId, String title) {
        Message root = messages.findById(messageId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Message not found"));
        Channel ch = channel(root.getChannelId());
        Set<Permission> held = access.permissions(ch, userId);
        var existing = threads.findByRootMessageId(messageId);
        if (existing.isPresent()) return dto(existing.get(), userId);
        if (root.getThreadId() != null) throw new ApiException(HttpStatus.BAD_REQUEST, "Threads cannot be nested");
        if (root.isDeleted()) throw new ApiException(HttpStatus.CONFLICT, "Cannot start a thread on a deleted message");
        if (ch.isArchived()) throw new ApiException(HttpStatus.CONFLICT, "This channel is archived and read-only");
        if (!held.contains(Permission.SEND_MESSAGES)) throw new ApiException(HttpStatus.FORBIDDEN, "Missing permission: SEND_MESSAGES");
        MessageThread t = new MessageThread();
        t.setChannelId(ch.getId());
        t.setRootMessageId(messageId);
        t.setCreatedBy(userId);
        if (title != null && !title.isBlank()) t.setTitle(title.trim());
        return dto(threads.saveAndFlush(t), userId);
    }

    @Transactional(readOnly = true)
    public ThreadDto get(UUID threadId, UUID userId) {
        MessageThread t = thread(threadId);
        access.permissions(channel(t.getChannelId()), userId);
        return dto(t, userId);
    }

    @Transactional(readOnly = true)
    public MessagePage replies(UUID threadId, UUID userId, UUID before, int limit) {
        return messageService.listThread(thread(threadId), userId, before, limit);
    }

    @Transactional
    public MessageDto reply(UUID threadId, UUID userId, SendRequest r) {
        MessageThread t = thread(threadId);
        if (t.isArchived()) throw new ApiException(HttpStatus.CONFLICT, "This thread is archived");
        return messageService.post(channel(t.getChannelId()), userId, r.body(), r.replyToId(), r.attachmentIds(), t, Boolean.TRUE.equals(r.autoRedact()));
    }

    /** Creator or a moderator may rename/archive. */
    @Transactional
    public ThreadDto update(UUID threadId, UUID userId, UpdateThreadRequest r) {
        MessageThread t = thread(threadId);
        Set<Permission> held = access.permissions(channel(t.getChannelId()), userId);
        if (!t.getCreatedBy().equals(userId) && !held.contains(Permission.MODERATE_MESSAGES)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only the thread creator or a moderator can change this thread");
        }
        if (r.title() != null) t.setTitle(r.title().isBlank() ? null : r.title().trim());
        if (r.archived() != null) t.setArchived(r.archived());
        return dto(threads.saveAndFlush(t), userId);
    }

    private ThreadDto dto(MessageThread t, UUID viewerId) {
        MessageDto root = messageService.dto(messages.findById(t.getRootMessageId()).orElseThrow(), viewerId);
        ThreadSummary s = root.thread();
        return new ThreadDto(t.getId(), t.getChannelId(), t.getRootMessageId(), t.getTitle(), t.isArchived(),
            s == null ? 0 : s.replyCount(), s == null ? null : s.lastReplyAt(), t.getCreatedBy(), t.getCreatedAt(), root);
    }

    private MessageThread thread(UUID id) {
        return threads.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Thread not found"));
    }

    private Channel channel(UUID id) {
        return channels.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
    }
}
