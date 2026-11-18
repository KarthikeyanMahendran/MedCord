package com.medcord.community;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "communities")
@Getter
@Setter
public class Community {
    public enum Visibility { PUBLIC, PRIVATE }

    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(nullable = false) private String name;
    @Column(nullable = false) private String slug;
    private String description;
    @Column(name = "specialty_tag") private String specialtyTag;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Visibility visibility = Visibility.PUBLIC;
    @Column(name = "owner_id", nullable = false) private UUID ownerId;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;
}
