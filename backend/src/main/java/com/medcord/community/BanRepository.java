package com.medcord.community;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface BanRepository extends JpaRepository<Ban, UUID> {
    boolean existsByCommunityIdAndUserId(UUID communityId, UUID userId);
    Optional<Ban> findByCommunityIdAndUserId(UUID communityId, UUID userId);
}
