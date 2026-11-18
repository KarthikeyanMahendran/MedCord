package com.medcord.community;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ChannelRepository extends JpaRepository<Channel, UUID> {
    List<Channel> findByCommunityIdOrderByPositionAscNameAsc(UUID communityId);
    boolean existsByCommunityIdAndNameIgnoreCase(UUID communityId, String name);
    int countByCommunityId(UUID communityId);
    java.util.Optional<Channel> findByDmKey(String dmKey);
}
