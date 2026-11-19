package com.medcord.attachment;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AttachmentRepository extends JpaRepository<MessageAttachment, UUID> {
    List<MessageAttachment> findByMessageIdInOrderByCreatedAtAsc(Collection<UUID> messageIds);
}
