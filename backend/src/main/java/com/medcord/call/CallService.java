package com.medcord.call;

import com.medcord.call.Call.Media;
import com.medcord.call.Call.Status;
import com.medcord.common.ApiException;
import com.medcord.community.Channel;
import com.medcord.community.ChannelRepository;
import com.medcord.dm.DmParticipant;
import com.medcord.dm.DmParticipantRepository;
import com.medcord.dm.UserBlockRepository;
import com.medcord.message.Message;
import com.medcord.message.MessageRepository;
import com.medcord.nexconn.ChannelTransport;
import com.medcord.nexconn.NexconnGateway;
import com.medcord.realtime.RealtimeEvent;
import com.medcord.realtime.RealtimeHub;
import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Authorises and records 1:1 calls. Media is carried by the realtime provider; MedCord decides who may call whom,
 * tracks the lifecycle and posts the outcome into the conversation.
 *
 * Lifecycle: RINGING -> CONNECTED -> ENDED, or RINGING -> MISSED | DECLINED | CANCELLED | FAILED.
 */
@Service
public class CallService {
    /** Unanswered calls are treated as missed after this long. */
    static final Duration RING_TIMEOUT = Duration.ofSeconds(60);
    /** A "connected" call this old is assumed abandoned (crashed client) and no longer blocks new calls. */
    static final Duration STALE_CONNECTED = Duration.ofHours(4);

    private final CallRepository calls;
    private final ChannelRepository channels;
    private final DmParticipantRepository participants;
    private final UserBlockRepository blocks;
    private final UserRepository users;
    private final MessageRepository messages;
    private final ChannelTransport transport;
    private final org.springframework.jdbc.core.simple.JdbcClient jdbc;
    private final RealtimeHub realtime;

    public CallService(CallRepository calls, ChannelRepository channels, DmParticipantRepository participants,
                       UserBlockRepository blocks, UserRepository users, MessageRepository messages,
                       ChannelTransport transport, org.springframework.jdbc.core.simple.JdbcClient jdbc,
                       RealtimeHub realtime) {
        this.calls = calls; this.channels = channels; this.participants = participants; this.blocks = blocks;
        this.users = users; this.messages = messages; this.transport = transport; this.jdbc = jdbc;
        this.realtime = realtime;
    }

    public record Party(UUID id, String displayName, String providerUserId) {}
    public record CallDto(UUID id, UUID channelId, Media media, Status status, Party caller, Party callee,
                          Instant createdAt, Instant connectedAt, Instant endedAt, Long durationSeconds) {}

    @Transactional
    public CallDto start(UUID userId, UUID channelId, Media media) {
        Channel ch = channels.findById(channelId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Conversation not found"));
        List<UUID> people;
        if (ch.getType() == Channel.Type.CASE) {
            // A case room is a conversation between the health worker who reported it and the doctor who accepted it.
            List<java.util.Map<String, Object>> rows = jdbc.sql("SELECT reporter_id, assigned_doctor_id FROM cases WHERE channel_id = :c").param("c", channelId).query().listOfRows();
            if (rows.isEmpty() || rows.get(0).get("assigned_doctor_id") == null) throw new ApiException(HttpStatus.CONFLICT, "You can call once a doctor has accepted this case");
            people = List.of((UUID) rows.get(0).get("reporter_id"), (UUID) rows.get(0).get("assigned_doctor_id"));
        } else if (ch.getType() == Channel.Type.DM) {
            people = participants.findByChannelId(channelId).stream().map(DmParticipant::getUserId).toList();
        } else {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Calls are available in direct messages and case rooms");
        }
        if (!people.contains(userId)) throw new ApiException(HttpStatus.NOT_FOUND, "Conversation not found");
        if (people.size() != 2) throw new ApiException(HttpStatus.BAD_REQUEST, "Calls are available in one-to-one conversations");
        UUID calleeId = people.stream().filter(p -> !p.equals(userId)).findFirst().orElseThrow();

        User caller = user(userId), callee = user(calleeId);
        if (caller.getStatus() == User.Status.SUSPENDED) throw new ApiException(HttpStatus.FORBIDDEN, "Account suspended");
        if (callee.getStatus() == User.Status.SUSPENDED || blocks.eitherBlocked(userId, calleeId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You can't call this person");
        }
        if (hasActiveCall(userId)) throw new ApiException(HttpStatus.CONFLICT, "You are already in a call");
        if (hasActiveCall(calleeId)) throw new ApiException(HttpStatus.CONFLICT, callee.getDisplayName() + " is on another call");

        Call c = new Call();
        c.setChannelId(channelId);
        c.setCallerId(userId);
        c.setCalleeId(calleeId);
        c.setMedia(media);
        Call saved = calls.saveAndFlush(c);

        // Notify callee in real-time over SSE
        realtime.sendToUser(calleeId, RealtimeEvent.of("CALL_INCOMING", channelId, null,
            java.util.Map.of("callId", saved.getId().toString(), "callerId", userId.toString(), "media", media.name())));

        return dto(saved);
    }

    /** Participants only; a ringing call past the timeout is finalised as missed on read. */
    @Transactional
    public CallDto get(UUID callId, UUID userId) {
        return dto(expireIfStale(owned(callId, userId)));
    }

    /** The caller records the provider's call id once the provider has placed the call. */
    @Transactional
    public CallDto attach(UUID callId, UUID userId, String providerCallId) {
        Call c = expireIfStale(owned(callId, userId));
        if (!c.getCallerId().equals(userId)) throw new ApiException(HttpStatus.FORBIDDEN, "Only the caller can attach the call");
        if (c.getStatus() != Status.RINGING) throw new ApiException(HttpStatus.CONFLICT, "Call is no longer ringing");
        c.setProviderCallId(providerCallId);
        return dto(calls.saveAndFlush(c));
    }

    @Transactional
    public CallDto connected(UUID callId, UUID userId) {
        Call c = expireIfStale(owned(callId, userId));
        if (c.getStatus() == Status.CONNECTED) return dto(c);                    // both sides report it; idempotent
        if (c.getStatus() != Status.RINGING) throw new ApiException(HttpStatus.CONFLICT, "Call already ended");
        c.setStatus(Status.CONNECTED);
        c.setConnectedAt(Instant.now());
        return dto(calls.saveAndFlush(c));
    }

    /**
     * Ends a call. Both clients report the end, so this is idempotent: the first report decides the outcome.
     * A connected call always ends as ENDED; an unanswered call ends as the requested outcome when the actor may set it.
     */
    @Transactional
    public CallDto end(UUID callId, UUID userId, Status requested) {
        Call c = expireIfStale(owned(callId, userId));
        if (c.getStatus().isFinal()) return dto(c);

        Status outcome;
        if (c.getStatus() == Status.CONNECTED) {
            outcome = Status.ENDED;
        } else {
            outcome = switch (requested) {
                case DECLINED -> { if (!c.getCalleeId().equals(userId)) throw new ApiException(HttpStatus.BAD_REQUEST, "Only the person called can decline"); yield Status.DECLINED; }
                case CANCELLED -> { if (!c.getCallerId().equals(userId)) throw new ApiException(HttpStatus.BAD_REQUEST, "Only the caller can cancel"); yield Status.CANCELLED; }
                case MISSED, FAILED -> requested;
                default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Outcome must be DECLINED, CANCELLED, MISSED or FAILED for an unanswered call");
            };
        }
        finish(c, outcome, userId);
        return dto(c);
    }

    // ---- helpers ----

    private boolean hasActiveCall(UUID userId) {
        return calls.activeFor(userId).stream().map(this::expireIfStale).anyMatch(c -> !c.getStatus().isFinal());
    }

    private Call expireIfStale(Call c) {
        Instant now = Instant.now();
        if (c.getStatus() == Status.RINGING && c.getCreatedAt().plus(RING_TIMEOUT).isBefore(now)) {
            finish(c, Status.MISSED, null);
        } else if (c.getStatus() == Status.CONNECTED && c.getConnectedAt() != null && c.getConnectedAt().plus(STALE_CONNECTED).isBefore(now)) {
            finish(c, Status.ENDED, null);
        }
        return c;
    }

    private void finish(Call c, Status outcome, UUID actor) {
        c.setStatus(outcome);
        c.setEndedAt(Instant.now());
        c.setEndedBy(actor);
        calls.saveAndFlush(c);

        // Record the outcome in the conversation, authored by the caller (as in other chat apps).
        Message m = new Message();
        m.setChannelId(c.getChannelId());
        m.setAuthorId(c.getCallerId());
        m.setKind("CALL");
        m.setCallId(c.getId());
        m.setBody(summary(c));
        messages.saveAndFlush(m);
        transport.onMessageSent(null, c.getChannelId(), m.getId());

        // Notify other peer in real time
        UUID peerId = (actor != null && actor.equals(c.getCallerId())) ? c.getCalleeId() : c.getCallerId();
        realtime.sendToUser(peerId, RealtimeEvent.of("CALL_ENDED", c.getChannelId(), null,
            java.util.Map.of("callId", c.getId().toString(), "outcome", outcome.name())));
    }

    @Transactional(readOnly = true)
    public void signal(UUID callId, UUID senderId, String kind, Object data) {
        Call c = expireIfStale(owned(callId, senderId));
        UUID recipientId = c.getCallerId().equals(senderId) ? c.getCalleeId() : c.getCallerId();
        java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("callId", callId.toString());
        payload.put("fromUserId", senderId.toString());
        payload.put("kind", kind);
        payload.put("data", data);
        realtime.sendToUser(recipientId, RealtimeEvent.of("CALL_SIGNAL", c.getChannelId(), null, payload));
    }

    static String summary(Call c) {
        String kind = c.getMedia() == Media.VIDEO ? "video call" : "voice call";
        return switch (c.getStatus()) {
            case ENDED -> capitalise(kind) + " · " + formatDuration(durationSeconds(c));
            case DECLINED -> capitalise(kind) + " declined";
            case FAILED -> capitalise(kind) + " failed";
            default -> "Missed " + kind;   // MISSED, CANCELLED (unanswered from the callee's point of view)
        };
    }

    static long durationSeconds(Call c) {
        if (c.getConnectedAt() == null || c.getEndedAt() == null) return 0;
        return Math.max(0, Duration.between(c.getConnectedAt(), c.getEndedAt()).toSeconds());
    }

    static String formatDuration(long s) {
        return s >= 3600 ? String.format("%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60) : String.format("%d:%02d", s / 60, s % 60);
    }

    private static String capitalise(String s) { return Character.toUpperCase(s.charAt(0)) + s.substring(1); }

    private Call owned(UUID callId, UUID userId) {
        Call c = calls.findById(callId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Call not found"));
        if (!c.involves(userId)) throw new ApiException(HttpStatus.NOT_FOUND, "Call not found");
        return c;
    }

    private User user(UUID id) {
        return users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
    }

    private CallDto dto(Call c) {
        User caller = user(c.getCallerId()), callee = user(c.getCalleeId());
        return new CallDto(c.getId(), c.getChannelId(), c.getMedia(), c.getStatus(),
            new Party(caller.getId(), caller.getDisplayName(), NexconnGateway.toNexconnUserId(caller.getId())),
            new Party(callee.getId(), callee.getDisplayName(), NexconnGateway.toNexconnUserId(callee.getId())),
            c.getCreatedAt(), c.getConnectedAt(), c.getEndedAt(), c.getStatus().isFinal() ? durationSeconds(c) : null);
    }
}
