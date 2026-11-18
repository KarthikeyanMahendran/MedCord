package com.medcord.community;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface InviteRepository extends JpaRepository<Invite, UUID> {
    Optional<Invite> findByCode(String code);
    List<Invite> findByCommunityIdOrderByIdDesc(UUID communityId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Invite i set i.uses = i.uses + 1 where i.id = ?1 and (i.maxUses is null or i.uses < i.maxUses)")
    int consume(UUID id);
}
