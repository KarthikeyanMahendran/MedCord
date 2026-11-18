package com.medcord.moderation;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "message_reports")
@Getter
@Setter
public class MessageReport {
    public enum Reason { SPAM, HARASSMENT, PHI, MISINFORMATION, OTHER }
    public enum Status { OPEN, RESOLVED, DISMISSED }

    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "message_id", nullable = false) private UUID messageId;
    @Column(name = "community_id", nullable = false) private UUID communityId;
    @Column(name = "reporter_id", nullable = false) private UUID reporterId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Reason reason;
    private String details;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Status status = Status.OPEN;
    @Column(name = "handled_by") private UUID handledBy;
    @Column(name = "handled_at") private Instant handledAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
}
