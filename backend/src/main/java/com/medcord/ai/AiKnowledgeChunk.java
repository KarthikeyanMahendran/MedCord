package com.medcord.ai;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "ai_knowledge_chunks")
@Getter
@Setter
public class AiKnowledgeChunk {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "community_id")
    private UUID communityId;

    @Column(name = "channel_id", nullable = false)
    private UUID channelId;

    @Column(name = "thread_id")
    private UUID threadId;

    @Column(name = "author_id", nullable = false)
    private UUID authorId;

    @Column(name = "author_name", length = 120)
    private String authorName;

    @Column(name = "channel_name", length = 64)
    private String channelName;

    @Column(name = "community_name", length = 120)
    private String communityName;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "message_ids", nullable = false, columnDefinition = "TEXT")
    private String messageIds;

    @Column(columnDefinition = "TEXT")
    private String embedding;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
