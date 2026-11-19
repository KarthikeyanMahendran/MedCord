package com.medcord.message;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageBookmarkRepository extends JpaRepository<MessageBookmark, MessageBookmark.Key> {
    List<MessageBookmark> findByUserIdOrderByCreatedAtDesc(UUID userId);
    List<MessageBookmark> findByUserIdAndMessageIdIn(UUID userId, Collection<UUID> messageIds);
}
