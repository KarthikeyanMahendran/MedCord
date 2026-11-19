package com.medcord.notification;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.UUID;
import lombok.*;

@Entity
@Table(name = "channel_notification_prefs")
@IdClass(ChannelNotificationPref.Key.class)
@Getter
@Setter
public class ChannelNotificationPref {
    public enum Level { ALL, MENTIONS, MUTE }

    @Id @Column(name = "user_id") private UUID userId;
    @Id @Column(name = "channel_id") private UUID channelId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Level level = Level.ALL;

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class Key implements Serializable {
        private UUID userId;
        private UUID channelId;
    }
}
