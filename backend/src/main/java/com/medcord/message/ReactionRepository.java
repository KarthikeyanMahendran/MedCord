package com.medcord.message;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReactionRepository extends JpaRepository<Reaction, Reaction.Key> {
    interface Count {
        UUID getMessageId();
        String getEmoji();
        long getTotal();
        long getMine();
    }

    /** Per message and emoji: total and how many are by the viewer (0/1), in first-use order. */
    @Query("select r.messageId as messageId, r.emoji as emoji, count(r) as total, "
        + "sum(case when r.userId = ?2 then 1 else 0 end) as mine "
        + "from Reaction r where r.messageId in ?1 group by r.messageId, r.emoji order by min(r.createdAt)")
    List<Count> counts(Collection<UUID> messageIds, UUID viewerId);

    @Query("select count(distinct r.emoji) from Reaction r where r.messageId = ?1")
    long distinctEmojis(UUID messageId);

    boolean existsByMessageIdAndEmoji(UUID messageId, String emoji);
}
