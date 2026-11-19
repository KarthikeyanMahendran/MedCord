package com.medcord.notification;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageMentionRepository extends JpaRepository<MessageMention, UUID> {
    List<MessageMention> findByMentionedUserIdOrderByCreatedAtDesc(UUID userId, Pageable page);
    List<MessageMention> findByMessageId(UUID messageId);
}
