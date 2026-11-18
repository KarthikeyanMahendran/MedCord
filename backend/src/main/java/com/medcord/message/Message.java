package com.medcord.message;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "messages")
@Getter
@Setter
public class Message {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "channel_id", nullable = false) private UUID channelId;
    @Column(name = "author_id", nullable = false) private UUID authorId;
    @Column(nullable = false) private String body;
    @Column(name = "reply_to_id") private UUID replyToId;
    @Column(name = "thread_id") private UUID threadId;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    @Column(name = "edited_at") private Instant editedAt;
    @Column(name = "deleted_at") private Instant deletedAt;
    @Column(name = "deleted_by") private UUID deletedBy;

    public boolean isDeleted() { return deletedAt != null; }
}
