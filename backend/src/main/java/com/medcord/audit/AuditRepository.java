package com.medcord.audit;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AuditRepository extends JpaRepository<AuditEntry, UUID> {
    @Query("select a from AuditEntry a where a.communityId = ?1 order by a.createdAt desc, a.id desc")
    Page<AuditEntry> forCommunity(UUID communityId, Pageable page);

    @Query("select a from AuditEntry a where a.communityId = ?1 and a.action = ?2 order by a.createdAt desc, a.id desc")
    Page<AuditEntry> forCommunityAndAction(UUID communityId, String action, Pageable page);
}
