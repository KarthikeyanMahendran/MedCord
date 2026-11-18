package com.medcord.message;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    @Query("select m from Message m where m.channelId = ?1 order by m.createdAt desc, m.id desc")
    List<Message> latest(UUID channelId, Pageable page);

    @Query("select m from Message m where m.channelId = ?1 and (m.createdAt < ?2 or (m.createdAt = ?2 and m.id < ?3)) "
        + "order by m.createdAt desc, m.id desc")
    List<Message> before(UUID channelId, Instant createdAt, UUID id, Pageable page);
}
