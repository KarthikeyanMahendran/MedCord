package com.medcord.community;

import jakarta.persistence.*;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "roles")
@Getter
@Setter
public class Role {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "community_id", nullable = false) private UUID communityId;
    @Column(nullable = false) private String name;
    /** Lower number = higher rank. OWNER is 0. */
    @Column(nullable = false) private int position;
    @Column(name = "system_key") private String systemKey;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "role_permissions", joinColumns = @JoinColumn(name = "role_id"))
    @Column(name = "permission")
    @Enumerated(EnumType.STRING)
    private Set<Permission> permissions = new HashSet<>();

    public boolean isSystem() { return systemKey != null; }
}
