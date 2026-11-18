package com.medcord.audit;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "audit_log")
@Getter
@Setter
public class AuditEntry {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "community_id") private UUID communityId;
    @Column(name = "actor_id", nullable = false) private UUID actorId;
    @Column(nullable = false) private String action;
    @Column(name = "target_type") private String targetType;
    @Column(name = "target_id") private UUID targetId;
    @Column(nullable = false) private String summary;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
}
