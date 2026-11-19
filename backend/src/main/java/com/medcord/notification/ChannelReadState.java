package com.medcord.notification;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;
import lombok.*;

@Entity
@Table(name = "channel_read_states")
@IdClass(ChannelReadState.Key.class)
@Getter
@Setter
public class ChannelReadState {
    @Id @Column(name = "user_id") private UUID userId;
    @Id @Column(name = "channel_id") private UUID channelId;
    @Column(name = "last_read_message_id") private UUID lastReadMessageId;
    @Column(name = "last_read_at", nullable = false) private Instant lastReadAt = Instant.now();

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class Key implements Serializable {
        private UUID userId;
        private UUID channelId;
    }
}
