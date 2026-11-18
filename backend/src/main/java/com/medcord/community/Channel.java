package com.medcord.community;

import jakarta.persistence.*;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "channels")
@Getter
@Setter
public class Channel {
    public enum Type { TEXT, ANNOUNCEMENT }

    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "community_id", nullable = false) private UUID communityId;
    @Column(nullable = false) private String name;
    private String topic;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Type type = Type.TEXT;
    @Column(nullable = false) private int position;
    @Column(nullable = false) private boolean archived;
}
