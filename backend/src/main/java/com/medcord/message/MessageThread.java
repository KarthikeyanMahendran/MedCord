package com.medcord.message;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "threads")
@Getter
@Setter
public class MessageThread {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "channel_id", nullable = false) private UUID channelId;
    @Column(name = "root_message_id", nullable = false) private UUID rootMessageId;
    private String title;
    @Column(nullable = false) private boolean archived;
    @Column(name = "created_by", nullable = false) private UUID createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
}
