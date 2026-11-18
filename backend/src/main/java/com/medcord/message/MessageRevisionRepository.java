package com.medcord.message;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MessageRevisionRepository extends JpaRepository<MessageRevision, UUID> {
    List<MessageRevision> findByMessageIdOrderByRevisionNoAsc(UUID messageId);

    @Query("select coalesce(max(r.revisionNo), 0) from MessageRevision r where r.messageId = ?1")
    int maxRevision(UUID messageId);
}
