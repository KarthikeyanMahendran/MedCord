package com.medcord.community;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface MembershipRepository extends JpaRepository<Membership, UUID> {
    Optional<Membership> findByCommunityIdAndUserId(UUID communityId, UUID userId);
    List<Membership> findByCommunityId(UUID communityId);
    long countByCommunityId(UUID communityId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from Membership m where m.communityId = ?1 and m.userId = ?2")
    int remove(UUID communityId, UUID userId);

    @Query("select count(m) from Membership m join m.roles r where r.id = ?1")
    long countWithRole(UUID roleId);

    @Query("select count(a) > 0 from Membership a, Membership b where a.communityId = b.communityId and a.userId = ?1 and b.userId = ?2")
    boolean shareCommunity(UUID userA, UUID userB);
}
