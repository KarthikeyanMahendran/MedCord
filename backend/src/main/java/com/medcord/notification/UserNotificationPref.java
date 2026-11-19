package com.medcord.notification;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "user_notification_prefs")
@Getter
@Setter
public class UserNotificationPref {
    @Id @Column(name = "user_id") private UUID userId;
    @Column(name = "dnd_enabled", nullable = false) private boolean dndEnabled;
    @Column(name = "dnd_start") private String dndStart;
    @Column(name = "dnd_end") private String dndEnd;
    @Column(name = "show_toasts", nullable = false) private boolean showToasts = true;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();
}
