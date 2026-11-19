package com.medcord.realtime;

import com.medcord.community.Channel;
import com.medcord.community.ChannelRepository;
import com.medcord.community.Membership;
import com.medcord.community.MembershipRepository;
import com.medcord.dm.DmParticipant;
import com.medcord.dm.DmParticipantRepository;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * First-party SSE realtime companion hub that works alongside Nexconn ({@link com.medcord.nexconn.NexconnChannelTransport}).
 * Delivers instant message/reaction/pin/thread updates, typing indicators, notifications, and voice room presence.
 */
@Service
public class RealtimeHub {
    private static final Logger log = LoggerFactory.getLogger(RealtimeHub.class);
    private static final long EMITTER_TIMEOUT_MS = 30 * 60 * 1000L;

    private final ConcurrentHashMap<UUID, CopyOnWriteArrayList<SseEmitter>> emitters = new ConcurrentHashMap<>();
    private final ChannelRepository channels;
    private final MembershipRepository memberships;
    private final DmParticipantRepository dmParticipants;

    public RealtimeHub(ChannelRepository channels, MembershipRepository memberships, DmParticipantRepository dmParticipants) {
        this.channels = channels;
        this.memberships = memberships;
        this.dmParticipants = dmParticipants;
    }

    public SseEmitter connect(UUID userId) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        emitters.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        Runnable cleanup = () -> remove(userId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(ex -> cleanup.run());
        try {
            emitter.send(SseEmitter.event().name("CONNECTED").data(Map.of("userId", userId.toString())));
        } catch (IOException ex) {
            cleanup.run();
        }
        return emitter;
    }

    public boolean hasSubscribers() {
        return !emitters.isEmpty();
    }

    public void sendToUser(UUID userId, RealtimeEvent event) {
        afterCommit(() -> dispatchToUser(userId, event));
    }

    public void sendToUsers(Collection<UUID> userIds, RealtimeEvent event) {
        if (emitters.isEmpty() || userIds.isEmpty()) return;
        List<UUID> targets = new ArrayList<>(userIds);
        afterCommit(() -> {
            for (UUID uid : targets) dispatchToUser(uid, event);
        });
    }

    public void publishToChannel(UUID channelId, RealtimeEvent event) {
        publishToChannel(channelId, event, null);
    }

    public void publishToChannel(UUID channelId, RealtimeEvent event, UUID excludeUserId) {
        if (emitters.isEmpty()) return;
        List<UUID> audience = resolveAudience(channelId, excludeUserId);
        if (audience.isEmpty()) return;
        afterCommit(() -> {
            for (UUID uid : audience) dispatchToUser(uid, event);
        });
    }

    public void publishToCommunity(UUID communityId, RealtimeEvent event) {
        if (emitters.isEmpty() || communityId == null) return;
        List<UUID> audience = memberships.findByCommunityId(communityId).stream()
            .map(Membership::getUserId)
            .filter(emitters::containsKey)
            .toList();
        if (audience.isEmpty()) return;
        afterCommit(() -> {
            for (UUID uid : audience) dispatchToUser(uid, event);
        });
    }

    public void onMessageSent(UUID communityId, UUID channelId, UUID messageId) {
        publishToChannel(channelId, RealtimeEvent.of("MESSAGE_CREATED", channelId, communityId, Map.of("messageId", messageId)));
    }

    public void onMessageEdited(UUID communityId, UUID channelId, UUID messageId) {
        publishToChannel(channelId, RealtimeEvent.of("MESSAGE_UPDATED", channelId, communityId, Map.of("messageId", messageId)));
    }

    public void onMessageDeleted(UUID communityId, UUID channelId, UUID messageId) {
        publishToChannel(channelId, RealtimeEvent.of("MESSAGE_DELETED", channelId, communityId, Map.of("messageId", messageId)));
    }

    /** Periodic SSE heartbeat so reverse proxies do not close idle streams. */
    @Scheduled(fixedDelay = 25000)
    public void heartbeat() {
        emitters.forEach((uid, list) -> {
            for (SseEmitter em : list) {
                try {
                    em.send(SseEmitter.event().comment("ping"));
                } catch (Exception ex) {
                    remove(uid, em);
                }
            }
        });
    }

    private List<UUID> resolveAudience(UUID channelId, UUID excludeUserId) {
        Optional<Channel> opt = channels.findById(channelId);
        if (opt.isEmpty()) return List.of();
        Channel ch = opt.get();
        List<UUID> ids;
        if (ch.getType() == Channel.Type.DM) {
            ids = dmParticipants.findByChannelId(channelId).stream().map(DmParticipant::getUserId).toList();
        } else if (ch.getCommunityId() != null) {
            ids = memberships.findByCommunityId(ch.getCommunityId()).stream().map(Membership::getUserId).toList();
        } else {
            return List.of();
        }
        return ids.stream()
            .filter(uid -> !Objects.equals(uid, excludeUserId))
            .filter(emitters::containsKey)
            .toList();
    }

    private void dispatchToUser(UUID userId, RealtimeEvent event) {
        List<SseEmitter> list = emitters.get(userId);
        if (list == null || list.isEmpty()) return;
        for (SseEmitter em : list) {
            try {
                em.send(SseEmitter.event().name(event.type()).data(event));
            } catch (Exception ex) {
                log.debug("Dropping closed SSE emitter for {}", userId);
                remove(userId, em);
            }
        }
    }

    private void remove(UUID userId, SseEmitter emitter) {
        emitters.computeIfPresent(userId, (k, list) -> {
            list.remove(emitter);
            return list.isEmpty() ? null : list;
        });
    }

    private static void afterCommit(Runnable task) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { task.run(); }
            });
        } else {
            task.run();
        }
    }
}
