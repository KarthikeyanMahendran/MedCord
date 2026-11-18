package com.medcord.message;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "message_revisions")
@Getter
@Setter
public class MessageRevision {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "message_id", nullable = false) private UUID messageId;
    @Column(name = "revision_no", nullable = false) private int revisionNo;
    @Column(nullable = false) private String kind;
    @Column(nullable = false) private String body;
    @Column(name = "actor_id", nullable = false) private UUID actorId;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
}
