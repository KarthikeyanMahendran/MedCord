package com.medcord.message;

import com.medcord.common.ApiException;
import com.medcord.community.*;
import com.medcord.message.MessageDtos.*;
import com.medcord.nexconn.ChannelTransport;
import com.medcord.user.*;
import com.medcord.user.ProfessionalProfile.Verification;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MessageService {
    private final MessageRepository messages;
    private final MessageRevisionRepository revisions;
    private final ThreadRepository threads;
    private final ReactionRepository reactions;
    private final ChannelRepository channels;
    private final UserRepository users;
    private final ProfessionalProfileRepository profiles;
    private final ChannelAccess access;
    private final ChannelTransport transport;
    private final com.medcord.moderation.MuteRepository mutes;
    private final com.medcord.audit.AuditService audit;
    private final Duration editWindow;

    public MessageService(MessageRepository messages, MessageRevisionRepository revisions, ThreadRepository threads, ReactionRepository reactions, ChannelRepository channels,
                          UserRepository users, ProfessionalProfileRepository profiles, ChannelAccess access,
                          ChannelTransport transport, com.medcord.moderation.MuteRepository mutes, com.medcord.audit.AuditService audit,
                          @Value("${medcord.messages.edit-window-minutes:1440}") long editWindowMinutes) {
        this.messages = messages; this.revisions = revisions; this.threads = threads; this.reactions = reactions; this.channels = channels; this.users = users;
        this.profiles = profiles; this.access = access; this.transport = transport;
        this.mutes = mutes; this.audit = audit;
        this.editWindow = Duration.ofMinutes(editWindowMinutes);
    }

    @Transactional
    public MessageDto send(UUID channelId, UUID userId, SendRequest r) {
        return post(channel(channelId), userId, r.body(), r.replyToId(), null);
    }

    /** Shared posting path for channel messages (threadId == null) and thread replies. */
    MessageDto post(Channel ch, UUID userId, String rawBody, UUID replyToId, MessageThread thread) {
        Set<Permission> held = access.permissions(ch, userId);
        if (ch.isArchived()) throw new ApiException(HttpStatus.CONFLICT, "This channel is archived and read-only");
        access.assertCanPost(ch, userId);
        if (ch.getCommunityId() != null) {
            mutes.findByCommunityIdAndUserId(ch.getCommunityId(), userId).filter(x -> x.getUntil().isAfter(Instant.now())).ifPresent(x -> {
                throw new ApiException(HttpStatus.FORBIDDEN, "You are muted in this community until " + x.getUntil());
            });
        }
        if (!held.contains(Permission.SEND_MESSAGES)) throw new ApiException(HttpStatus.FORBIDDEN, "Missing permission: SEND_MESSAGES");
        // Announcement channels restrict top-level posts; discussion in their threads stays open to members.
        if (thread == null && ch.getType() == Channel.Type.ANNOUNCEMENT && !held.contains(Permission.POST_ANNOUNCEMENTS)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only members with POST_ANNOUNCEMENTS can post here");
        }
        User u = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        if (u.getStatus() == User.Status.SUSPENDED) throw new ApiException(HttpStatus.FORBIDDEN, "Account suspended");
        String body = rawBody.trim();
        if (body.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Message cannot be empty");

        Message msg = new Message();
        msg.setChannelId(ch.getId());
        msg.setAuthorId(userId);
        msg.setBody(body);
        if (thread != null) msg.setThreadId(thread.getId());
        if (replyToId != null) {
            UUID scope = thread == null ? null : thread.getId();
            Message target = messages.findById(replyToId)
                .filter(t -> (t.getChannelId().equals(ch.getId()) && Objects.equals(t.getThreadId(), scope))
                    || (thread != null && t.getId().equals(thread.getRootMessageId())))
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Reply target not found here"));
            msg.setReplyToId(target.getId());
        }
        msg = messages.saveAndFlush(msg);
        transport.onMessageSent(ch.getCommunityId(), ch.getId(), msg.getId());
        return toDtos(List.of(msg), userId).get(0);
    }

    /** Page of a thread's replies (oldest to newest within the page). */
    @Transactional(readOnly = true)
    public MessagePage listThread(MessageThread t, UUID userId, UUID before, int limit) {
        access.permissions(channel(t.getChannelId()), userId);
        int size = Math.min(Math.max(limit, 1), 100);
        List<Message> page;
        if (before == null) {
            page = messages.latestInThread(t.getId(), PageRequest.of(0, size + 1));
        } else {
            Message cursor = messages.findById(before).filter(x -> t.getId().equals(x.getThreadId()))
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Unknown cursor"));
            page = messages.beforeInThread(t.getId(), cursor.getCreatedAt(), cursor.getId(), PageRequest.of(0, size + 1));
        }
        boolean hasMore = page.size() > size;
        List<Message> slice = new ArrayList<>(hasMore ? page.subList(0, size) : page);
        Collections.reverse(slice);
        return new MessagePage(toDtos(slice, userId), hasMore);
    }

    MessageDto dto(Message m, UUID viewerId) { return toDtos(List.of(m), viewerId).get(0); }

    /** Newest page first in storage order; returned oldest-to-newest for display. Cursor = id of the oldest message already loaded. */
    @Transactional(readOnly = true)
    public MessagePage list(UUID channelId, UUID userId, UUID before, int limit) {
        Channel ch = channel(channelId);
        access.permissions(ch, userId);
        int size = Math.min(Math.max(limit, 1), 100);
        List<Message> page;
        if (before == null) {
            page = messages.latest(channelId, PageRequest.of(0, size + 1));
        } else {
            Message cursor = messages.findById(before).filter(x -> x.getChannelId().equals(channelId))
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Unknown cursor"));
            page = messages.before(channelId, cursor.getCreatedAt(), cursor.getId(), PageRequest.of(0, size + 1));
        }
        boolean hasMore = page.size() > size;
        List<Message> slice = new ArrayList<>(hasMore ? page.subList(0, size) : page);
        Collections.reverse(slice);
        return new MessagePage(toDtos(slice, userId), hasMore);
    }

    /** Author-only, inside the edit window. The previous content is snapshotted first. */
    @Transactional
    public MessageDto edit(UUID messageId, UUID userId, String newBody) {
        Message msg = message(messageId);
        Channel ch = channel(msg.getChannelId());
        access.permissions(ch, userId);
        if (msg.isDeleted()) throw new ApiException(HttpStatus.CONFLICT, "Message was deleted");
        if (!msg.getAuthorId().equals(userId)) throw new ApiException(HttpStatus.FORBIDDEN, "Only the author can edit a message");
        if (!"TEXT".equals(msg.getKind())) throw new ApiException(HttpStatus.CONFLICT, "Call records cannot be edited");
        if (ch.isArchived()) throw new ApiException(HttpStatus.CONFLICT, "This channel is archived and read-only");
        if (msg.getCreatedAt().plus(editWindow).isBefore(Instant.now())) throw new ApiException(HttpStatus.CONFLICT, "The edit window has passed");
        String body = newBody.trim();
        if (body.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Message cannot be empty");
        if (body.equals(msg.getBody())) throw new ApiException(HttpStatus.BAD_REQUEST, "No changes to save");

        snapshot(msg, "EDIT", userId);
        msg.setBody(body);
        msg.setEditedAt(Instant.now());
        messages.saveAndFlush(msg);
        transport.onMessageEdited(ch.getCommunityId(), ch.getId(), msg.getId());
        return toDtos(List.of(msg), userId).get(0);
    }

    /** Author or MODERATE_MESSAGES. Soft delete + tombstone snapshot (kept for audit). */
    @Transactional
    public void delete(UUID messageId, UUID userId) {
        Message msg = message(messageId);
        Channel ch = channel(msg.getChannelId());
        Set<Permission> held = access.permissions(ch, userId);
        if (msg.isDeleted()) return;
        boolean moderator = held.contains(Permission.MODERATE_MESSAGES);
        if (!msg.getAuthorId().equals(userId) && !moderator) throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed to delete this message");
        snapshot(msg, "DELETE", userId);
        msg.setDeletedAt(Instant.now());
        msg.setDeletedBy(userId);
        messages.saveAndFlush(msg);
        if (!msg.getAuthorId().equals(userId) && ch.getCommunityId() != null) {
            audit.record(ch.getCommunityId(), userId, "MESSAGE_DELETED_BY_MOD", "MESSAGE", msg.getId(), "Deleted a message by " + audit.userName(msg.getAuthorId()) + " in #" + ch.getName());
        }
        transport.onMessageDeleted(ch.getCommunityId(), ch.getId(), msg.getId());
    }

    /** Edit history is visible to the author and to moderators. */
    @Transactional(readOnly = true)
    public List<RevisionDto> history(UUID messageId, UUID userId) {
        Message msg = message(messageId);
        Channel ch = channel(msg.getChannelId());
        Set<Permission> held = access.permissions(ch, userId);
        if (!msg.getAuthorId().equals(userId) && !held.contains(Permission.MODERATE_MESSAGES)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Not allowed to view this history");
        }
        List<MessageRevision> list = revisions.findByMessageIdOrderByRevisionNoAsc(messageId);
        Map<UUID, String> names = users.findAllById(list.stream().map(MessageRevision::getActorId).collect(Collectors.toSet()))
            .stream().collect(Collectors.toMap(User::getId, User::getDisplayName));
        return list.stream().map(r -> new RevisionDto(r.getRevisionNo(), r.getKind(), r.getBody(), r.getActorId(),
            names.get(r.getActorId()), r.getCreatedAt())).toList();
    }

    // ---- helpers ----

    private void snapshot(Message msg, String kind, UUID actor) {
        MessageRevision r = new MessageRevision();
        r.setMessageId(msg.getId());
        r.setRevisionNo(revisions.maxRevision(msg.getId()) + 1);
        r.setKind(kind);
        r.setBody(msg.getBody());
        r.setActorId(actor);
        revisions.saveAndFlush(r);
    }

    private Channel channel(UUID id) {
        return channels.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
    }

    private Message message(UUID id) {
        return messages.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Message not found"));
    }

    /** Batch-loads authors, profiles and reply targets to avoid N+1 queries. */
    List<MessageDto> toDtos(List<Message> list, UUID viewerId) {
        Set<UUID> replyIds = list.stream().map(Message::getReplyToId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, Message> replies = messages.findAllById(replyIds).stream().collect(Collectors.toMap(Message::getId, x -> x));
        Set<UUID> authorIds = new HashSet<>();
        list.forEach(m -> authorIds.add(m.getAuthorId()));
        replies.values().forEach(m -> authorIds.add(m.getAuthorId()));
        Map<UUID, User> authors = users.findAllById(authorIds).stream().collect(Collectors.toMap(User::getId, x -> x));
        Map<UUID, MessageThread> threadByRoot = threads.findByRootMessageIdIn(list.stream().map(Message::getId).toList())
            .stream().collect(Collectors.toMap(MessageThread::getRootMessageId, x -> x));
        Map<UUID, ThreadRepository.Stats> stats = threadByRoot.isEmpty() ? Map.of()
            : threads.stats(threadByRoot.values().stream().map(MessageThread::getId).toList()).stream().collect(Collectors.toMap(ThreadRepository.Stats::getThreadId, x -> x));
        Map<UUID, List<ReactionDto>> reactionMap = new HashMap<>();
        reactions.counts(list.stream().map(Message::getId).toList(), viewerId).forEach(c ->
            reactionMap.computeIfAbsent(c.getMessageId(), k -> new ArrayList<>()).add(new ReactionDto(c.getEmoji(), c.getTotal(), c.getMine() > 0)));
        Map<UUID, ProfessionalProfile> profs = profiles.findAllById(authorIds).stream().collect(Collectors.toMap(ProfessionalProfile::getUserId, x -> x));

        return list.stream().map(m -> {
            User a = authors.get(m.getAuthorId());
            ProfessionalProfile p = profs.get(m.getAuthorId());
            Author author = new Author(m.getAuthorId(), a == null ? "Unknown" : a.getDisplayName(),
                p == null ? null : p.getSpecialty(), p != null && p.getVerificationStatus() == Verification.APPROVED);
            ReplyPreview preview = null;
            if (m.getReplyToId() != null) {
                Message t = replies.get(m.getReplyToId());
                if (t != null) {
                    User ta = authors.get(t.getAuthorId());
                    preview = new ReplyPreview(t.getId(), ta == null ? "Unknown" : ta.getDisplayName(),
                        t.isDeleted() ? null : excerpt(t.getBody()), t.isDeleted());
                }
            }
            MessageThread th = threadByRoot.get(m.getId());
            ThreadSummary summary = null;
            if (th != null) {
                ThreadRepository.Stats st = stats.get(th.getId());
                summary = new ThreadSummary(th.getId(), th.getTitle(), st == null ? 0 : st.getReplyCount(),
                    st == null ? null : st.getLastReplyAt(), th.isArchived());
            }
            return new MessageDto(m.getId(), m.getChannelId(), author, m.isDeleted() ? null : m.getBody(),
                m.getCreatedAt(), m.getEditedAt(), m.isDeleted(), preview, summary, m.getThreadId(),
                m.isDeleted() ? List.of() : reactionMap.getOrDefault(m.getId(), List.of()), m.getPinnedAt() != null && !m.isDeleted(),
                m.getKind(), m.getCallId());
        }).toList();
    }

    private static String excerpt(String s) { return s.length() <= 100 ? s : s.substring(0, 100) + "…"; }
}
