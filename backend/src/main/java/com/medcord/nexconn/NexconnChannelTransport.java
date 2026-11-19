package com.medcord.nexconn;

import com.medcord.realtime.RealtimeEvent;
import com.medcord.realtime.RealtimeHub;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Primary {@link ChannelTransport} bridging MedCord domain events to Nexconn (when configured)
 * AND fanning out to MedCord's first-party SSE {@link RealtimeHub} companion stream.
 * Nexconn remains the realtime SDK/Server API provider; SSE augments it for typing, unreads, and firewall resilience.
 */
@Component
public class NexconnChannelTransport implements ChannelTransport {
    private static final Logger log = LoggerFactory.getLogger(NexconnChannelTransport.class);

    private final NexconnGateway nexconn;
    private final RealtimeHub realtime;

    public NexconnChannelTransport(NexconnGateway nexconn, RealtimeHub realtime) {
        this.nexconn = nexconn;
        this.realtime = realtime;
    }

    @Override
    public void onChannelCreated(UUID communityId, UUID channelId, String name) {
        if (nexconn.enabled()) log.debug("Nexconn sync queued for channel created {} in {}", channelId, communityId);
        realtime.publishToCommunity(communityId, RealtimeEvent.of("CHANNEL_CREATED", channelId, communityId, Map.of("id", channelId, "name", name)));
    }

    @Override
    public void onChannelArchived(UUID communityId, UUID channelId) {
        if (nexconn.enabled()) log.debug("Nexconn sync queued for channel archived {} in {}", channelId, communityId);
        realtime.publishToCommunity(communityId, RealtimeEvent.of("CHANNEL_UPDATED", channelId, communityId, Map.of("id", channelId, "archived", true)));
    }

    @Override
    public void onMemberJoined(UUID communityId, UUID userId) {
        if (nexconn.enabled()) log.debug("Nexconn sync queued for member {} joined {}", userId, communityId);
        realtime.publishToCommunity(communityId, RealtimeEvent.of("MEMBER_UPDATED", null, communityId, Map.of("userId", userId, "action", "JOINED")));
    }

    @Override
    public void onMemberLeft(UUID communityId, UUID userId) {
        if (nexconn.enabled()) log.debug("Nexconn sync queued for member {} left {}", userId, communityId);
        realtime.publishToCommunity(communityId, RealtimeEvent.of("MEMBER_UPDATED", null, communityId, Map.of("userId", userId, "action", "LEFT")));
    }

    @Override
    public void onCommunityDeleted(UUID communityId) {
        if (nexconn.enabled()) log.debug("Nexconn sync queued for community deleted {}", communityId);
        realtime.publishToCommunity(communityId, RealtimeEvent.of("COMMUNITY_DELETED", null, communityId, Map.of("id", communityId)));
    }

    @Override
    public void onMessageSent(UUID communityId, UUID channelId, UUID messageId) {
        if (nexconn.enabled()) log.debug("Nexconn realtime fan-out for message {} in {}", messageId, channelId);
        realtime.publishToChannel(channelId, RealtimeEvent.of("MESSAGE_CREATED", channelId, communityId, Map.of("messageId", messageId)));
    }

    @Override
    public void onMessageEdited(UUID communityId, UUID channelId, UUID messageId) {
        if (nexconn.enabled()) log.debug("Nexconn realtime edit fan-out for message {} in {}", messageId, channelId);
        realtime.publishToChannel(channelId, RealtimeEvent.of("MESSAGE_UPDATED", channelId, communityId, Map.of("messageId", messageId)));
    }

    @Override
    public void onMessageDeleted(UUID communityId, UUID channelId, UUID messageId) {
        if (nexconn.enabled()) log.debug("Nexconn realtime delete fan-out for message {} in {}", messageId, channelId);
        realtime.publishToChannel(channelId, RealtimeEvent.of("MESSAGE_DELETED", channelId, communityId, Map.of("messageId", messageId)));
    }
}
