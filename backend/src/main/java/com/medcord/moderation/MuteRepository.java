package com.medcord.moderation;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MuteRepository extends JpaRepository<CommunityMute, UUID> {
    Optional<CommunityMute> findByCommunityIdAndUserId(UUID communityId, UUID userId);

    @Query("select m from CommunityMute m where m.communityId = ?1 and m.until > ?2 order by m.until desc")
    List<CommunityMute> active(UUID communityId, Instant now);
}
