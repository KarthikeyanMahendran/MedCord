package com.medcord.dm;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "user_blocks")
@IdClass(UserBlock.Key.class)
@Getter
@Setter
public class UserBlock {
    @Id @Column(name = "blocker_id") private UUID blockerId;
    @Id @Column(name = "blocked_id") private UUID blockedId;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    @Getter @Setter @NoArgsConstructor
    public static class Key implements Serializable {
        private UUID blockerId;
        private UUID blockedId;

        public Key(UUID blockerId, UUID blockedId) { this.blockerId = blockerId; this.blockedId = blockedId; }
        @Override public boolean equals(Object o) { return o instanceof Key k && Objects.equals(blockerId, k.blockerId) && Objects.equals(blockedId, k.blockedId); }
        @Override public int hashCode() { return Objects.hash(blockerId, blockedId); }
    }
}
