package com.medcord.community;

import jakarta.persistence.*;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "community_bans")
@Getter
@Setter
public class Ban {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "community_id", nullable = false) private UUID communityId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "banned_by", nullable = false) private UUID bannedBy;
    private String reason;
}
