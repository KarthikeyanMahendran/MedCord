package com.medcord.message;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ThreadRepository extends JpaRepository<MessageThread, UUID> {
    Optional<MessageThread> findByRootMessageId(UUID rootMessageId);
    List<MessageThread> findByRootMessageIdIn(Collection<UUID> rootMessageIds);

    interface Stats {
        UUID getThreadId();
        long getReplyCount();
        Instant getLastReplyAt();
    }

    /** Live (non-deleted) reply counts, computed on read so they can never drift. */
    @Query("select m.threadId as threadId, count(m) as replyCount, max(m.createdAt) as lastReplyAt "
        + "from Message m where m.threadId in ?1 and m.deletedAt is null group by m.threadId")
    List<Stats> stats(Collection<UUID> threadIds);
}
