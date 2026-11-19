package com.medcord.notification;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChannelNotificationPrefRepository extends JpaRepository<ChannelNotificationPref, ChannelNotificationPref.Key> {
    List<ChannelNotificationPref> findByUserId(UUID userId);
    List<ChannelNotificationPref> findByChannelId(UUID channelId);
}
