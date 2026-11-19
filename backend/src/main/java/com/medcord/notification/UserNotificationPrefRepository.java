package com.medcord.notification;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserNotificationPrefRepository extends JpaRepository<UserNotificationPref, UUID> {}
