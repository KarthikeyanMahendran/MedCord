package com.medcord.message;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "message_reactions")
@IdClass(Reaction.Key.class)
@Getter
@Setter
public class Reaction {
    @Id @Column(name = "message_id") private UUID messageId;
    @Id @Column(name = "user_id") private UUID userId;
    @Id @Column(name = "emoji") private String emoji;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    @Getter @Setter @NoArgsConstructor
    public static class Key implements Serializable {
        private UUID messageId;
        private UUID userId;
        private String emoji;

        public Key(UUID messageId, UUID userId, String emoji) {
            this.messageId = messageId; this.userId = userId; this.emoji = emoji;
        }

        @Override public boolean equals(Object o) {
            return o instanceof Key k && java.util.Objects.equals(messageId, k.messageId)
                && java.util.Objects.equals(userId, k.userId) && java.util.Objects.equals(emoji, k.emoji);
        }
        @Override public int hashCode() { return java.util.Objects.hash(messageId, userId, emoji); }
    }
}
