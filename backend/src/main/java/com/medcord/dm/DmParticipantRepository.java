package com.medcord.dm;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DmParticipantRepository extends JpaRepository<DmParticipant, DmParticipant.Key> {
    boolean existsByChannelIdAndUserId(UUID channelId, UUID userId);
    List<DmParticipant> findByChannelId(UUID channelId);

    @Query("select p.channelId from DmParticipant p where p.userId = ?1")
    List<UUID> channelIdsOf(UUID userId);
}
