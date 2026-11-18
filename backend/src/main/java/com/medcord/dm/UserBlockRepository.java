package com.medcord.dm;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserBlockRepository extends JpaRepository<UserBlock, UserBlock.Key> {
    List<UserBlock> findByBlockerIdOrderByCreatedAtDesc(UUID blockerId);

    /** True if either user has blocked the other. */
    @Query("select count(b) > 0 from UserBlock b where (b.blockerId = ?1 and b.blockedId = ?2) or (b.blockerId = ?2 and b.blockedId = ?1)")
    boolean eitherBlocked(UUID a, UUID b);
}
