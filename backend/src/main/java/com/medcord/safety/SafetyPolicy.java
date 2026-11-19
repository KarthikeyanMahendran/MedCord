package com.medcord.safety;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "community_safety_policies")
@Getter
@Setter
public class SafetyPolicy {
    public enum PhiMode { OFF, WARN, STRICT_BLOCK }

    @Id
    @Column(name = "community_id")
    private UUID communityId;

    @Enumerated(EnumType.STRING)
    @Column(name = "phi_mode", nullable = false)
    private PhiMode phiMode = PhiMode.WARN;

    @Column(name = "auto_redact", nullable = false)
    private boolean autoRedact;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
