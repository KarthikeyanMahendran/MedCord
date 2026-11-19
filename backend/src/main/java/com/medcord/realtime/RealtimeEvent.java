package com.medcord.realtime;

import java.time.Instant;
import java.util.UUID;

/** Envelope pushed over Server-Sent Events (SSE) to connected clients. */
public record RealtimeEvent(String type, UUID channelId, UUID communityId, Object payload, Instant at) {
    public static RealtimeEvent of(String type, UUID channelId, UUID communityId, Object payload) {
        return new RealtimeEvent(type, channelId, communityId, payload, Instant.now());
    }
}
