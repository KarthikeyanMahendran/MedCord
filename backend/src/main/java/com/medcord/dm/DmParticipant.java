package com.medcord.dm;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "dm_participants")
@IdClass(DmParticipant.Key.class)
@Getter
@Setter
public class DmParticipant {
    @Id @Column(name = "channel_id") private UUID channelId;
    @Id @Column(name = "user_id") private UUID userId;

    public DmParticipant() {}

    public DmParticipant(UUID channelId, UUID userId) {
        this.channelId = channelId;
        this.userId = userId;
    }

    @Getter @Setter @NoArgsConstructor
    public static class Key implements Serializable {
        private UUID channelId;
        private UUID userId;

        @Override public boolean equals(Object o) { return o instanceof Key k && Objects.equals(channelId, k.channelId) && Objects.equals(userId, k.userId); }
        @Override public int hashCode() { return Objects.hash(channelId, userId); }
    }
}
