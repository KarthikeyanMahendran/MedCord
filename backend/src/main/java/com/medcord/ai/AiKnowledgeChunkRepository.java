package com.medcord.ai;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface AiKnowledgeChunkRepository extends JpaRepository<AiKnowledgeChunk, UUID> {
    List<AiKnowledgeChunk> findByCommunityIdIn(Collection<UUID> communityIds);

    @Modifying
    @Query("DELETE FROM AiKnowledgeChunk c WHERE c.communityId = :communityId")
    void deleteByCommunityId(@Param("communityId") UUID communityId);
}
