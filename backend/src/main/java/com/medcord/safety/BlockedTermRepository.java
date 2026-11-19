package com.medcord.safety;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BlockedTermRepository extends JpaRepository<BlockedTerm, UUID> {
    List<BlockedTerm> findByCommunityIdOrderByCreatedAtDesc(UUID communityId);
    Optional<BlockedTerm> findByCommunityIdAndTermIgnoreCase(UUID communityId, String term);
}
