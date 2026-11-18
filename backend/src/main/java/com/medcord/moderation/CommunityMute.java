package com.medcord.moderation;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "community_mutes")
@Getter
@Setter
public class CommunityMute {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "community_id", nullable = false) private UUID communityId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(nullable = false) private Instant until;
    private String reason;
    @Column(name = "muted_by", nullable = false) private UUID mutedBy;
}
