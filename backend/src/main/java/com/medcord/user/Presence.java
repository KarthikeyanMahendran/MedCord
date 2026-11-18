package com.medcord.user;

import java.time.Duration;
import java.time.Instant;

/** A user is "online" if their client sent a heartbeat in the last 90 seconds. */
public final class Presence {
    public static final Duration WINDOW = Duration.ofSeconds(90);

    private Presence() {}

    public static boolean online(User u) {
        return u.getLastSeenAt() != null && u.getLastSeenAt().isAfter(Instant.now().minus(WINDOW));
    }
}
