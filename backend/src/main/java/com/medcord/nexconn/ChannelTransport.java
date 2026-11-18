package com.medcord.nexconn;

import java.util.UUID;

/**
 * Boundary between MedCord domain logic and the real-time provider (Nexconn).
 * Domain code calls only this interface; the Nexconn-backed implementation arrives in T-010.
 */
public interface ChannelTransport {
    void onChannelCreated(UUID communityId, UUID channelId, String name);
    void onChannelArchived(UUID communityId, UUID channelId);
    void onMemberJoined(UUID communityId, UUID userId);
    void onMemberLeft(UUID communityId, UUID userId);
    void onCommunityDeleted(UUID communityId);
    /** Realtime fan-out hooks; the message is already persisted when these fire. */
    void onMessageSent(UUID communityId, UUID channelId, UUID messageId);
    void onMessageEdited(UUID communityId, UUID channelId, UUID messageId);
    void onMessageDeleted(UUID communityId, UUID channelId, UUID messageId);
}
