package com.medcord.message;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;
import lombok.*;

@Entity
@Table(name = "message_bookmarks")
@IdClass(MessageBookmark.Key.class)
@Getter
@Setter
public class MessageBookmark {
    @Id @Column(name = "user_id") private UUID userId;
    @Id @Column(name = "message_id") private UUID messageId;
    private String note;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    @Data @NoArgsConstructor @AllArgsConstructor
    public static class Key implements Serializable {
        private UUID userId;
        private UUID messageId;
    }
}
