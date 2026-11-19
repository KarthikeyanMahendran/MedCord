package com.medcord.notification;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "message_mentions")
@Getter
@Setter
public class MessageMention {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "message_id", nullable = false) private UUID messageId;
    @Column(name = "channel_id", nullable = false) private UUID channelId;
    @Column(name = "mentioned_user_id", nullable = false) private UUID mentionedUserId;
    @Column(name = "mention_kind", nullable = false) private String mentionKind;
    @Column(nullable = false) private String label;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
}
