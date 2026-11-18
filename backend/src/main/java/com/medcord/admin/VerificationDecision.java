package com.medcord.admin;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "verification_decisions")
@Getter
@Setter
public class VerificationDecision {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "decided_by", nullable = false)
    private UUID decidedBy;

    @Column(nullable = false)
    private String decision;

    private String reason;

    @Column(name = "decided_at", nullable = false, insertable = false, updatable = false)
    private Instant decidedAt;
}
