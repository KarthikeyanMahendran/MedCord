package com.medcord.community;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface RoleRepository extends JpaRepository<Role, UUID> {
    List<Role> findByCommunityIdOrderByPositionAsc(UUID communityId);
    Optional<Role> findByCommunityIdAndSystemKey(UUID communityId, String systemKey);
    boolean existsByCommunityIdAndNameIgnoreCase(UUID communityId, String name);
}
