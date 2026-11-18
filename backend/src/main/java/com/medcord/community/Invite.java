package com.medcord.community;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "invites")
@Getter
@Setter
public class Invite {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "community_id", nullable = false) private UUID communityId;
    @Column(nullable = false) private String code;
    @Column(name = "created_by", nullable = false) private UUID createdBy;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "max_uses") private Integer maxUses;
    @Column(nullable = false) private int uses;
    @Column(name = "revoked_at") private Instant revokedAt;
}
