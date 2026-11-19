package com.medcord.user;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
public class User {
    public enum Status { PENDING, ACTIVE, SUSPENDED }
    public enum PlatformRole { USER, ADMIN }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "platform_role", nullable = false)
    private PlatformRole platformRole = PlatformRole.USER;

    /** DOCTOR or HEALTH_WORKER. A health worker is active at once; a doctor waits for licence review. */
    @Column(name = "account_type", nullable = false)
    private String accountType = "DOCTOR";

    @Column(name = "preferred_language", nullable = false)
    private String preferredLanguage = "en";

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    /** Written only via UserRepository.touch (heartbeat), never by entity saves. */
    @Column(name = "last_seen_at", insertable = false, updatable = false)
    private Instant lastSeenAt;
}
