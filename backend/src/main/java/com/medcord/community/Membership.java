package com.medcord.community;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "memberships")
@Getter
@Setter
public class Membership {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "community_id", nullable = false) private UUID communityId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "joined_at", insertable = false, updatable = false) private Instant joinedAt;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "membership_roles", joinColumns = @JoinColumn(name = "membership_id"),
               inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();

    public int topPosition() { return roles.stream().mapToInt(Role::getPosition).min().orElse(Integer.MAX_VALUE); }
}
