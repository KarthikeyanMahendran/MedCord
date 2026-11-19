package com.medcord.call;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;
import lombok.*;

@Entity
@Table(name = "voice_room_participants")
@IdClass(VoiceRoomParticipant.Key.class)
@Getter
@Setter
public class VoiceRoomParticipant {
    @Id @Column(name = "channel_id") private UUID channelId;
    @Id @Column(name = "user_id") private UUID userId;
    @Column(name = "mic_on", nullable = false) private boolean micOn = true;
    @Column(name = "cam_on", nullable = false) private boolean camOn = false;
    @Column(name = "screen_sharing", nullable = false) private boolean screenSharing = false;
    @Column(name = "joined_at", nullable = false) private Instant joinedAt = Instant.now();

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class Key implements Serializable {
        private UUID channelId;
        private UUID userId;
    }
}
